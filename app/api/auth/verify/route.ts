import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/jwt'
import { z } from 'zod'

// Validation schema for token verification
const verifySchema = z.object({
  token: z.string().min(1, 'Token is required'),
  clubId: z.string().optional(),
  planeId: z.string().optional(),
  isClubAdminRoute: z.boolean().optional(),
  isAdminRoute: z.boolean().optional()
})

export async function POST(request: Request) {
  try {
    // Parse and validate request body
    const body = await request.json()
    const validatedData = verifySchema.parse(body)

    // Verify the token
    try {
      const payload = await verifyToken(validatedData.token)
      const userId = payload.id

      // For admin routes, we need to double check with the database
      if (validatedData.isAdminRoute) {
        // Check if user exists, is active, and is admin
        const user = await prisma.pilot.findUnique({
          where: { 
            id: userId,
            status: 'ACTIVE',
            is_admin: true
          }
        })

        if (!user) {
          return NextResponse.json(
            {
              isValid: false,
              error: 'Unauthorized: Admin access required'
            },
            { status: 403 }
          )
        }
      } else {
        // For non-admin routes, verify user is active (status can change)
        const user = await prisma.pilot.findUnique({
          where: { 
            id: userId,
            status: 'ACTIVE'
          }
        })

        if (!user) {
          return NextResponse.json(
            { 
              isValid: false,
              error: 'User not found or not active'
            },
            { status: 404 }
          )
        }
      }

      // Check club admin routes using JWT data
      if (validatedData.isClubAdminRoute) {
        let clubId = validatedData.clubId

        // If no clubId but planeId is provided, lookup the clubId
        if (!clubId && validatedData.planeId) {
          const plane = await prisma.plane.findUnique({
            where: { id: validatedData.planeId },
            select: { clubId: true }
          })
          
          if (plane) {
            clubId = plane.clubId
          }
        }

        // If we have a clubId, check if user is club admin from JWT
        if (clubId && !payload.is_admin) { // Skip check if system admin
          const userClubs = payload.clubs || []
          const isClubAdmin = userClubs.some(club => 
            club.clubId === clubId && club.role === 'ADMIN'
          )

          if (!isClubAdmin) {
            return NextResponse.json(
              {
                isValid: false,
                error: 'Unauthorized: You must be a club admin or system admin'
              },
              { status: 403 }
            )
          }
        }
      }

      // All checks passed
      return NextResponse.json({
        isValid: true,
        userId: userId,
        isAdmin: payload.is_admin
      })

    } catch (error) {
      console.error('Token verification error:', error)
      return NextResponse.json(
        { 
          isValid: false,
          error: 'Invalid token'
        },
        { status: 401 }
      )
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { 
          isValid: false,
          error: error.errors 
        },
        { status: 400 }
      )
    }

    console.error('Verify error:', error)
    return NextResponse.json(
      { 
        isValid: false,
        error: 'Internal server error'
      },
      { status: 500 }
    )
  }
} 