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

    const { clubId, pin, selectedAirfield } = validation.data

    // Find club in database
    const club = await prisma.club.findUnique({
      where: { id: clubId },
      select: {
        id: true,
        homefield: true,
        allowed_airfields: true,
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

    // Note: We now allow any airfield to be selected during login
    // The airfield selection is no longer restricted to club's allowed_airfields

    // Generate JWT tokens
    const jwtPayload: JWTPayload = {
      id: club.id,
      clubId: club.id,
      homefield: club.homefield,
      selectedAirfield: selectedAirfield || club.homefield || undefined,
      allowedAirfields: [
        ...(club.allowed_airfields || []),
        ...(club.homefield ? [club.homefield] : [])
      ],
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
    const requestUrl = new URL(request.url)
    const isLocalOrInternal = requestUrl.hostname === 'localhost' || 
                             requestUrl.hostname === '127.0.0.1' ||
                             requestUrl.hostname.startsWith('192.168.') ||
                             requestUrl.hostname.startsWith('10.') ||
                             requestUrl.hostname.startsWith('172.')
    
    // Temporarily disable secure cookies completely for troubleshooting
    const useSecureCookies = false
    
    const accessTokenCookieName = process.env.TABLET_ACCESS_TOKEN_COOKIE_NAME || 'tablet-access-token'
    const refreshTokenCookieName = process.env.TABLET_REFRESH_TOKEN_COOKIE_NAME || 'tablet-refresh-token'
    
    const accessTokenCookie = serialize(
      accessTokenCookieName, 
      accessToken, 
      {
      httpOnly: true,
        secure: useSecureCookies,
      path: '/',
        maxAge: accessTokenExpiresIn,
      sameSite: 'lax',
      }
    )

    const refreshTokenCookie = serialize(
      refreshTokenCookieName, 
      refreshToken, 
      {
      httpOnly: true,
        secure: useSecureCookies,
      path: '/',
        maxAge: refreshTokenExpiresIn,
      sameSite: 'lax',
      }
    )

    // Create response with cookies
    const responseData: AuthResponse = { 
      success: true, 
      clubId: club.id, 
      homefield: club.homefield || undefined,
      selectedAirfield: selectedAirfield || club.homefield || undefined
    }
    
    const response = NextResponse.json<AuthResponse>(responseData)
    
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