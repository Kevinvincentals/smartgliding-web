import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/jwt'

export async function GET(request: Request) {
  try {
    // Get JWT payload from middleware (tablet authentication)
    const jwtPayload = request.headers.get('x-jwt-payload')
    if (!jwtPayload) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      )
    }

    const payload = JSON.parse(jwtPayload)
    const clubId = payload.clubId

    if (!clubId) {
      return NextResponse.json(
        { error: 'Club ID not found in token' },
        { status: 400 }
      )
    }

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

    // Fetch all admin users assigned to this club
    const adminUsers = await prisma.clubPilot.findMany({
      where: {
        clubId: clubId,
        role: 'ADMIN'
      },
      include: {
        pilot: {
          select: {
            id: true,
            firstname: true,
            lastname: true,
            email: true,
            personal_pin: true,
            status: true
          }
        }
      },
      orderBy: {
        pilot: {
          lastname: 'asc'
        }
      }
    })

    // Filter out inactive pilots and format response
    const activeAdmins = adminUsers
      .filter(clubPilot => clubPilot.pilot.status === 'ACTIVE')
      .map(clubPilot => ({
        id: clubPilot.pilot.id,
        name: `${clubPilot.pilot.firstname} ${clubPilot.pilot.lastname}`,
        email: clubPilot.pilot.email,
        hasPin: !!clubPilot.pilot.personal_pin
      }))

    return NextResponse.json(
      { 
        success: true,
        admins: activeAdmins,
        clubName: club.name
      },
      { status: 200 }
    )

  } catch (error) {
    console.error('Get admin users error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}