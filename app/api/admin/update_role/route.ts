import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { ClubRole } from '@prisma/client'

// Validation schema for role update
const updateRoleSchema = z.object({
  pilotId: z.string().min(1, 'Pilot ID is required'),
  clubId: z.string().min(1, 'Club ID is required'),
  clubRole: z.nativeEnum(ClubRole, {
    errorMap: () => ({ message: 'Invalid club role. Must be either ADMIN or USER' })
  })
})

export async function POST(request: Request) {
  try {
    // Parse and validate request body
    const body = await request.json()
    const validatedData = updateRoleSchema.parse(body)

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

    // Update the club-pilot relationship
    const updatedClubPilot = await prisma.clubPilot.update({
      where: {
        pilotId_clubId: {
          pilotId: validatedData.pilotId,
          clubId: validatedData.clubId
        }
      },
      data: {
        role: validatedData.clubRole
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
    if (error instanceof Error && error.message.includes('Record to update does not exist')) {
      return NextResponse.json(
        { error: 'Pilot is not assigned to this club' },
        { status: 404 }
      )
    }
    
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