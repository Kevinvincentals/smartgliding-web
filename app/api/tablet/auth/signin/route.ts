import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { generateTokens, type JWTPayload } from '@/lib/jwt'
import { serialize } from 'cookie'
import type { AuthResponse } from '@/types/tablet-api'
import { authRequestSchema, validateRequestBody } from '@/lib/validations/tablet-api'

/**
 * Handles tablet authentication signin
 * Validates club PIN and returns JWT tokens via HTTP-only cookies
 */
export async function POST(request: NextRequest): Promise<NextResponse<AuthResponse>> {
  try {
    const body = await request.json()
    
    // Validate request body with Zod
    const validation = validateRequestBody(authRequestSchema, body)
    if (!validation.success) {
      return NextResponse.json<AuthResponse>(
        { 
          success: false, 
          error: validation.error,
          ...(validation.details && { details: validation.details.join(', ') })
        },
        { status: 400 }
      )
    }

    const { clubId, pin } = validation.data

    // Find club in database
    const club = await prisma.club.findUnique({
      where: { id: clubId },
      select: {
        id: true,
        homefield: true,
        club_pin: true,
        name: true,
      },
    })

    if (!club) {
      return NextResponse.json<AuthResponse>(
        { success: false, error: 'Club not found' }, 
        { status: 404 }
      )
    }

    // Validate PIN
    const storedPin = club.club_pin?.toString()
    if (storedPin !== pin) {
      console.warn(`Tablet auth attempt failed for club: ${club.name} (ID: ${club.id}). Incorrect PIN.`)
      return NextResponse.json<AuthResponse>(
        { success: false, error: 'Forkert pinkode til klub!' },
        { status: 401 }
      )
    }

    // Generate JWT tokens
    const jwtPayload: JWTPayload = {
      id: club.id,
      clubId: club.id,
      homefield: club.homefield,
    }

    const { 
      accessToken, 
      refreshToken, 
      accessTokenExpiresIn, 
      refreshTokenExpiresIn 
    } = await generateTokens(jwtPayload)

    console.log(`Tablet auth success for club: ${club.name} (ID: ${club.id})`)

    // Set secure HTTP-only cookies
    const isProduction = process.env.NODE_ENV === 'production'
    
    const accessTokenCookie = serialize(
      process.env.TABLET_ACCESS_TOKEN_COOKIE_NAME || 'tablet-access-token', 
      accessToken, 
      {
      httpOnly: true,
        secure: isProduction,
      path: '/',
        maxAge: accessTokenExpiresIn,
      sameSite: 'lax',
      }
    )

    const refreshTokenCookie = serialize(
      process.env.TABLET_REFRESH_TOKEN_COOKIE_NAME || 'tablet-refresh-token', 
      refreshToken, 
      {
      httpOnly: true,
        secure: isProduction,
      path: '/',
        maxAge: refreshTokenExpiresIn,
      sameSite: 'lax',
      }
    )

    // Create response with cookies
    const response = NextResponse.json<AuthResponse>({ 
      success: true, 
      clubId: club.id, 
      homefield: club.homefield || undefined
    })
    
    response.headers.append('Set-Cookie', accessTokenCookie)
    response.headers.append('Set-Cookie', refreshTokenCookie)

    return response

  } catch (error) {
    console.error('Error in tablet auth signin:', error)
    return NextResponse.json<AuthResponse>(
      { success: false, error: 'Internal server error during authentication' },
      { status: 500 }
    )
  }
} 