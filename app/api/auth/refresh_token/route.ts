import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { generateTokens, verifyToken } from '@/lib/jwt'

// Validation schema for refresh token request
const refreshSchema = z.object({
  refresh_token: z.string().min(1, 'Refresh token is required'),
})

export async function POST(request: Request) {
  try {
    const body = await request.json()
    
    // Validate request body
    const validatedData = refreshSchema.parse(body)
    
    try {
      // Verify the refresh token
      const payload = await verifyToken(validatedData.refresh_token)
      
      // Check if pilot still exists and is active
      const pilot = await prisma.pilot.findUnique({
        where: { 
          id: payload.id,
          status: 'ACTIVE'
        },
        select: {
          id: true,
          email: true,
          is_admin: true,
          clubs: {
            select: {
              role: true,
              club: {
                select: {
                  id: true,
                  name: true
                }
              }
            }
          }
        }
      })

      if (!pilot) {
        return NextResponse.json(
          { error: 'Invalid refresh token' },
          { status: 401 }
        )
      }

      // Format club memberships for JWT
      const clubMemberships = pilot.clubs.map(membership => ({
        clubId: membership.club.id,
        clubName: membership.club.name,
        role: membership.role
      }))

      // Generate new tokens
      const tokens = await generateTokens({
        id: pilot.id,
        email: pilot.email,
        is_admin: pilot.is_admin,
        clubs: clubMemberships
      })

      // Return response with new tokens
      return NextResponse.json(
        { 
          message: 'Tokens refreshed successfully',
          tokens: {
            access_token: tokens.accessToken,
            refresh_token: tokens.refreshToken,
          }
        },
        { status: 200 }
      )

    } catch (error) {
      console.error('Token verification error:', error)
      return NextResponse.json(
        { error: 'Invalid refresh token' },
        { status: 401 }
      )
    }

  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.errors },
        { status: 400 }
      )
    }

    console.error('Refresh token error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
} 