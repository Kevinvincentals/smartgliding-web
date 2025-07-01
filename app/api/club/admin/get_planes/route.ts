import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

// Validation schema for club ID
const clubIdSchema = z.object({
  clubId: z.string().min(1, 'Club ID is required')
})

export async function GET(request: Request) {
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

    // Validate club ID
    const validatedData = clubIdSchema.parse({ clubId })

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

    // Fetch all planes for the club with their latest flight information
    const planes = await prisma.plane.findMany({
      where: {
        clubId: validatedData.clubId
      },
      include: {
        club: {
          select: {
            id: true,
            name: true
          }
        },
        flightLogs: {
          select: {
            takeoff_time: true
          },
          orderBy: {
            takeoff_time: 'desc'
          },
          take: 1
        }
      }
    })

    // Sort planes by last flight date (most recent first, nulls last)
    const sortedPlanes = planes.sort((a, b) => {
      const aLastFlight = a.flightLogs[0]?.takeoff_time
      const bLastFlight = b.flightLogs[0]?.takeoff_time
      
      if (!aLastFlight && !bLastFlight) return a.registration_id.localeCompare(b.registration_id)
      if (!aLastFlight) return 1 // a goes to end
      if (!bLastFlight) return -1 // b goes to end
      
      return new Date(bLastFlight).getTime() - new Date(aLastFlight).getTime()
    })

    return NextResponse.json(
      { 
        message: 'Planes fetched successfully',
        planes: sortedPlanes
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

    console.error('Get planes error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
} 