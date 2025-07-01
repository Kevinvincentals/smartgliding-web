import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

// Validation schema for assigning a pilot
const assignPilotSchema = z.object({
  pilotId: z.string().min(1, 'Pilot ID is required'),
  role: z.enum(['USER', 'ADMIN']).default('USER')
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
    const validatedData = assignPilotSchema.parse(body)

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

    // Check if pilot exists
    const pilot = await prisma.pilot.findUnique({
      where: { 
        id: validatedData.pilotId
      }
    })

    if (!pilot) {
      return NextResponse.json(
        { error: 'Pilot not found' },
        { status: 404 }
      )
    }

    // Check if pilot is already assigned to this club
    const existingAssignment = await prisma.clubPilot.findUnique({
      where: {
        pilotId_clubId: {
          pilotId: validatedData.pilotId,
          clubId: clubId
        }
      }
    })

    if (existingAssignment) {
      return NextResponse.json(
        { error: 'Pilot is already assigned to this club' },
        { status: 400 }
      )
    }

    // Assign the pilot to the club
    const clubPilot = await prisma.clubPilot.create({
      data: {
        pilotId: validatedData.pilotId,
        clubId: clubId,
        role: validatedData.role
      },
      include: {
        pilot: {
          select: {
            id: true,
            firstname: true,
            lastname: true,
            email: true,
            phone: true,
            dsvu_id: true,
            status: true,
            membership: true
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
        message: 'Pilot assigned to club successfully',
        clubPilot: clubPilot
      },
      { status: 201 }
    )
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.errors[0].message },
        { status: 400 }
      )
    }

    console.error('Assign pilot error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}