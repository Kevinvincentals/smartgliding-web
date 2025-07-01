import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

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

    // Fetch yearly statistics in parallel
    const [
      totalPilots,
      totalFlights,
      flightTimeAndStarts
    ] = await Promise.all([
      // Total pilots count
      prisma.clubPilot.count({
        where: {
          clubId: clubId,
          pilot: {
            status: 'ACTIVE'
          }
        }
      }),

      // Total flights count (all time)
      prisma.flightLogbook.count({
        where: {
          clubId: clubId,
          deleted: false
        }
      }),

      // Get flight time and starts aggregation
      prisma.flightLogbook.aggregate({
        where: {
          clubId: clubId,
          deleted: false
        },
        _sum: {
          flight_duration: true
        },
        _count: {
          takeoff_time: true // Count flights with takeoff time (actual starts)
        }
      })
    ])

    return NextResponse.json(
      { 
        success: true,
        statistics: {
          totalPilots,
          totalFlights,
          totalFlightTime: flightTimeAndStarts._sum.flight_duration || 0,
          totalStarts: flightTimeAndStarts._count.takeoff_time || 0
        }
      },
      { status: 200 }
    )

  } catch (error) {
    console.error('Get overview statistics error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}