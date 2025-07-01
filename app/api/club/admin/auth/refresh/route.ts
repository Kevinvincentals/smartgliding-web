import { NextResponse } from 'next/server'
import { jwtVerify } from 'jose'
import { generateTokens } from '@/lib/jwt'
import { prisma } from '@/lib/prisma'

const JWT_SECRET_STRING = process.env.JWT_SECRET || 'your-super-secret-key-change-this-in-production'
const joseSecretKey = new TextEncoder().encode(JWT_SECRET_STRING)
const ADMIN_REFRESH_COOKIE_NAME = 'admin-refresh-token'

export async function POST(request: Request) {
  try {
    // Get refresh token from cookie
    const cookieHeader = request.headers.get('cookie')
    if (!cookieHeader) {
      return NextResponse.json(
        { success: false, error: 'No cookies found' },
        { status: 401 }
      )
    }

    // Parse refresh token from cookie header
    const cookies = cookieHeader.split(';').reduce((acc, cookie) => {
      const [name, value] = cookie.trim().split('=')
      acc[name] = value
      return acc
    }, {} as Record<string, string>)

    const refreshToken = cookies[ADMIN_REFRESH_COOKIE_NAME]
    if (!refreshToken) {
      return NextResponse.json(
        { success: false, error: 'Admin refresh token not found' },
        { status: 401 }
      )
    }

    // Verify the refresh token
    let payload: any
    try {
      const result = await jwtVerify(refreshToken, joseSecretKey)
      payload = result.payload
    } catch (error: any) {
      console.error('Admin refresh token verification failed:', error.message)
      
      const response = NextResponse.json(
        { success: false, error: 'Invalid or expired refresh token' },
        { status: 401 }
      )
      
      // Clear invalid cookies
      response.cookies.set('admin-access-token', '', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 0,
        path: '/'
      })
      response.cookies.set(ADMIN_REFRESH_COOKIE_NAME, '', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 0,
        path: '/'
      })
      
      return response
    }

    // Verify this is a valid admin refresh token with correct structure
    if (!payload.adminContext || payload.adminContext.sessionType !== 'club_admin') {
      return NextResponse.json(
        { success: false, error: 'Invalid admin refresh token structure' },
        { status: 401 }
      )
    }

    // Verify the admin still exists and is still an admin for this club
    const clubPilot = await prisma.clubPilot.findFirst({
      where: {
        pilotId: payload.id,
        clubId: payload.adminContext.clubId,
        role: 'ADMIN'
      },
      include: {
        pilot: {
          select: {
            id: true,
            firstname: true,
            lastname: true,
            email: true,
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

    if (!clubPilot || clubPilot.pilot.status !== 'ACTIVE') {
      const response = NextResponse.json(
        { success: false, error: 'Admin access revoked or account inactive' },
        { status: 403 }
      )
      
      // Clear cookies since admin access is no longer valid
      response.cookies.set('admin-access-token', '', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 0,
        path: '/'
      })
      response.cookies.set(ADMIN_REFRESH_COOKIE_NAME, '', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 0,
        path: '/'
      })
      
      return response
    }

    // Generate new tokens with updated admin context
    const newAdminPayload = {
      id: clubPilot.pilot.id,
      email: clubPilot.pilot.email || undefined,
      is_admin: true,
      clubs: [{
        clubId: payload.adminContext.clubId,
        clubName: clubPilot.club.name,
        role: 'ADMIN' as const
      }],
      adminContext: {
        clubId: payload.adminContext.clubId,
        clubName: clubPilot.club.name,
        pilotId: clubPilot.pilot.id,
        pilotName: `${clubPilot.pilot.firstname} ${clubPilot.pilot.lastname}`,
        sessionType: 'club_admin' as const
      }
    }

    const { accessToken, refreshToken: newRefreshToken, accessTokenExpiresIn, refreshTokenExpiresIn } = await generateTokens(newAdminPayload)

    // Set new cookies
    const response = NextResponse.json({ 
      success: true,
      message: 'Admin tokens refreshed successfully'
    })

    response.cookies.set('admin-access-token', accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: accessTokenExpiresIn,
      path: '/'
    })

    response.cookies.set(ADMIN_REFRESH_COOKIE_NAME, newRefreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: refreshTokenExpiresIn,
      path: '/'
    })

    return response

  } catch (error) {
    console.error('Admin token refresh error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error during token refresh' },
      { status: 500 }
    )
  }
}