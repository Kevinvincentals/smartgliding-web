import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { ClubRole } from '@prisma/client'

// Validation schema for updating a pilot's role
const updateRoleSchema = z.object({
  pilotId: z.string().min(1, 'Pilot ID is required'),
  clubId: z.string().min(1, 'Club ID is required'),
  role: z.nativeEnum(ClubRole, {
    errorMap: () => ({ message: 'Invalid role. Must be either USER or ADMIN' })
  })
})

export async function POST(request: Request) {
  try {
    // Get user ID from headers (set by middleware)
    const userId = request.headers.get('x-user-id')
    
    if (!userId) {
      return NextResponse.json(
        { error: 'User ID not found in request' },
        { status: 500 }
      )
    }
    
    // Parse and validate request body
    const body = await request.json()
    const validatedData = updateRoleSchema.parse(body)

    // Check if user is a club admin or system admin
    const clubAdmin = await prisma.clubPilot.findFirst({
      where: {
        pilotId: userId,
        clubId: validatedData.clubId,
        role: 'ADMIN'
      }
    })

    const systemAdmin = await prisma.pilot.findUnique({
      where: { 
        id: userId,
        is_admin: true
      }
    })

    if (!clubAdmin && !systemAdmin) {
      return NextResponse.json(
        { error: 'Unauthorized: You must be a club admin or system admin' },
        { status: 403 }
      )
    }

    // Check if club exists and is active
    const club = await prisma.club.findUnique({
      where: { 
        id: validatedData.clubId,
        status: 'active'
      }
    })

    if (!club) {
      return NextResponse.json(
        { error: 'Club not found or not active' },
        { status: 404 }
      )
    }

    // Check if pilot exists and is active
    const pilot = await prisma.pilot.findUnique({
      where: { 
        id: validatedData.pilotId,
        status: 'ACTIVE'
      }
    })

    if (!pilot) {
      return NextResponse.json(
        { error: 'Pilot not found or not active' },
        { status: 404 }
      )
    }

    // Check if pilot is assigned to the club
    const existingClubPilot = await prisma.clubPilot.findUnique({
      where: {
        pilotId_clubId: {
          pilotId: validatedData.pilotId,
          clubId: validatedData.clubId
        }
      }
    })

    if (!existingClubPilot) {
      return NextResponse.json(
        { error: 'Pilot is not assigned to this club' },
        { status: 404 }
      )
    }

    // Update the pilot's role
    const updatedClubPilot = await prisma.clubPilot.update({
      where: {
        pilotId_clubId: {
          pilotId: validatedData.pilotId,
          clubId: validatedData.clubId
        }
      },
      data: {
        role: validatedData.role
      },
      include: {
        pilot: {
          select: {
            id: true,
            firstname: true,
            lastname: true,
            email: true
          }
        },
        club: {
          select: {
            id: true,
            name: true
          }
        }
      }
    })

    return NextResponse.json(
      { 
        message: 'Pilot role updated successfully',
        clubPilot: updatedClubPilot
      },
      { status: 200 }
    )
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.errors },
        { status: 400 }
      )
    }

    console.error('Update role error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
