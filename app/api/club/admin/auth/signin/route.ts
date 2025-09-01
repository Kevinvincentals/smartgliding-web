import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { generateTokens } from '@/lib/jwt'
import { cleanupOldGuestPlanes } from '@/lib/utils'
import { z } from 'zod'

// Validation schema for admin signin
const signinSchema = z.object({
  pilotId: z.string().min(1, 'Pilot ID is required'),
  pin: z.string().length(4, 'PIN must be exactly 4 digits').regex(/^\d{4}$/, 'PIN must contain only digits')
})

export async function POST(request: Request) {
  try {
    // Get JWT payload from middleware (tablet authentication)
    const jwtPayload = request.headers.get('x-jwt-payload')
    if (!jwtPayload) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      )
    }

    const tabletPayload = JSON.parse(jwtPayload)
    const clubId = tabletPayload.clubId

    if (!clubId) {
      return NextResponse.json(
        { error: 'Club ID not found in token' },
        { status: 400 }
      )
    }

    const body = await request.json()
    const { pilotId, pin } = signinSchema.parse(body)

    // Verify that the pilot exists and is an admin for this club
    const clubPilot = await prisma.clubPilot.findFirst({
      where: {
        pilotId: pilotId,
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
            status: true,
            is_admin: true
          }
        },
        club: {
          select: {
            id: true,
            name: true,
            homefield: true
          }
        }
      }
    })

    if (!clubPilot) {
      return NextResponse.json(
        { error: 'Admin access not found for this club' },
        { status: 403 }
      )
    }

    if (clubPilot.pilot.status !== 'ACTIVE') {
      return NextResponse.json(
        { error: 'Account is not active' },
        { status: 403 }
      )
    }

    if (!clubPilot.pilot.personal_pin) {
      return NextResponse.json(
        { error: 'No PIN set for this user. Please contact an administrator.' },
        { status: 403 }
      )
    }

    // Verify PIN
    if (clubPilot.pilot.personal_pin !== pin) {
      return NextResponse.json(
        { error: 'Invalid PIN' },
        { status: 401 }
      )
    }

    // Generate admin JWT tokens with admin context
    const adminPayload = {
      id: clubPilot.pilot.id, // Pilot ID for admin user
      email: clubPilot.pilot.email || undefined,
      is_admin: true,
      clubs: [{
        clubId: clubId,
        clubName: clubPilot.club.name,
        role: 'ADMIN' as const
      }],
      // Admin-specific fields for audit logging
      adminContext: {
        clubId: clubId,
        clubName: clubPilot.club.name,
        pilotId: clubPilot.pilot.id,
        pilotName: `${clubPilot.pilot.firstname} ${clubPilot.pilot.lastname}`,
        sessionType: 'club_admin' as const
      }
    }

    const { accessToken, refreshToken, accessTokenExpiresIn, refreshTokenExpiresIn } = await generateTokens(adminPayload)

    // Set HTTP-only cookies for admin session
    const response = NextResponse.json(
      { 
        success: true,
        admin: {
          id: clubPilot.pilot.id,
          name: `${clubPilot.pilot.firstname} ${clubPilot.pilot.lastname}`,
          email: clubPilot.pilot.email,
          clubId: clubId,
          clubName: clubPilot.club.name
        }
      },
      { status: 200 }
    )

    // Set secure cookies for admin session
    response.cookies.set('admin-access-token', accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: accessTokenExpiresIn,
      path: '/'
    })

    response.cookies.set('admin-refresh-token', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: refreshTokenExpiresIn,
      path: '/'
    })

    // Clean up old guest planes as a background task
    cleanupOldGuestPlanes(clubId).catch(error => {
      console.error('Background cleanup of guest planes failed:', error)
    })

    return response

  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.errors[0].message },
        { status: 400 }
      )
    }

    console.error('Admin signin error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}