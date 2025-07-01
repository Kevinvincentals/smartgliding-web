import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

// Validation schema for unassigning a pilot
const unassignPilotSchema = z.object({
  pilotId: z.string().min(1, 'Pilot ID is required')
})

export async function POST(request: Request) {
  try {
    // Get admin JWT payload from middleware (admin authentication)
    const adminJwtPayload = request.headers.get('x-admin-jwt-payload')
    if (!adminJwtPayload) {
      return NextResponse.json(
        { error: 'Admin authentication required' },
        { status: 401 }
      )
    }

    const payload = JSON.parse(adminJwtPayload)
    const clubId = payload.adminContext?.clubId

    if (!clubId) {
      return NextResponse.json(
        { error: 'Club ID not found in admin session' },
        { status: 400 }
      )
    }
    
    // Parse and validate request body
    const body = await request.json()
    const validatedData = unassignPilotSchema.parse(body)

    // Check if club exists and is active
    const club = await prisma.club.findUnique({
      where: { 
        id: clubId,
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
    const clubPilot = await prisma.clubPilot.findUnique({
      where: {
        pilotId_clubId: {
          pilotId: validatedData.pilotId,
          clubId: clubId
        }
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

    if (!clubPilot) {
      return NextResponse.json(
        { error: 'Pilot is not assigned to this club' },
        { status: 404 }
      )
    }

    // Unassign the pilot from the club
    await prisma.clubPilot.delete({
      where: {
        pilotId_clubId: {
          pilotId: validatedData.pilotId,
          clubId: clubId
        }
      }
    })

    return NextResponse.json(
      { 
        message: 'Pilot unassigned from club successfully',
        unassignedPilot: clubPilot
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

    console.error('Unassign pilot error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
