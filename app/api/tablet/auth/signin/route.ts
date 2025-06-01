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
    console.log('=== TABLET AUTH SIGNIN START ===')
    
    const body = await request.json()
    console.log('Auth request body:', JSON.stringify(body, null, 2))
    
    // Validate request body with Zod
    const validation = validateRequestBody(authRequestSchema, body)
    if (!validation.success) {
      console.log('❌ Validation failed:', validation.error)
      if (validation.details) {
        console.log('Validation details:', validation.details)
      }
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
    console.log(`🔍 Looking up club: ID="${clubId}", PIN="${pin}"`)

    // Find club in database
    console.log('📊 Querying database for club...')
    const club = await prisma.club.findUnique({
      where: { id: clubId },
      select: {
        id: true,
        homefield: true,
        club_pin: true,
        name: true,
      },
    })

    console.log('📊 Database query result:', club ? {
      id: club.id,
      name: club.name,
      homefield: club.homefield,
      pin_exists: !!club.club_pin,
      pin_value: club.club_pin?.toString() // This might be sensitive, but needed for debugging
    } : 'null (club not found)')

    if (!club) {
      console.log('❌ Club not found in database')
      return NextResponse.json<AuthResponse>(
        { success: false, error: 'Club not found' }, 
        { status: 404 }
      )
    }

    // Validate PIN
    const storedPin = club.club_pin?.toString()
    console.log(`🔐 PIN validation: provided="${pin}", stored="${storedPin}", match=${storedPin === pin}`)
    
    if (storedPin !== pin) {
      console.warn(`❌ Tablet auth attempt failed for club: ${club.name} (ID: ${club.id}). Incorrect PIN.`)
      return NextResponse.json<AuthResponse>(
        { success: false, error: 'Forkert pinkode til klub!' },
        { status: 401 }
      )
    }

    console.log('✅ PIN validation successful')

    // Generate JWT tokens
    const jwtPayload: JWTPayload = {
      id: club.id,
      clubId: club.id,
      homefield: club.homefield,
    }
    console.log('🎫 JWT payload:', JSON.stringify(jwtPayload, null, 2))

    console.log('🎫 Generating JWT tokens...')
    const { 
      accessToken, 
      refreshToken, 
      accessTokenExpiresIn, 
      refreshTokenExpiresIn 
    } = await generateTokens(jwtPayload)

    console.log('🎫 Token generation complete:', {
      accessToken_length: accessToken.length,
      refreshToken_length: refreshToken.length,
      accessTokenExpiresIn,
      refreshTokenExpiresIn,
      accessToken_preview: accessToken.substring(0, 20) + '...',
      refreshToken_preview: refreshToken.substring(0, 20) + '...'
    })

    console.log(`✅ Tablet auth success for club: ${club.name} (ID: ${club.id})`)

    // Set secure HTTP-only cookies
    const isProduction = process.env.NODE_ENV === 'production'
    console.log(`🍪 Cookie settings: isProduction=${isProduction}, NODE_ENV=${process.env.NODE_ENV}`)
    
    const accessTokenCookieName = process.env.TABLET_ACCESS_TOKEN_COOKIE_NAME || 'tablet-access-token'
    const refreshTokenCookieName = process.env.TABLET_REFRESH_TOKEN_COOKIE_NAME || 'tablet-refresh-token'
    
    console.log(`🍪 Cookie names: access="${accessTokenCookieName}", refresh="${refreshTokenCookieName}"`)
    
    const accessTokenCookie = serialize(
      accessTokenCookieName, 
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
      refreshTokenCookieName, 
      refreshToken, 
      {
      httpOnly: true,
        secure: isProduction,
      path: '/',
        maxAge: refreshTokenExpiresIn,
      sameSite: 'lax',
      }
    )

    console.log('🍪 Serialized cookies:', {
      accessTokenCookie_length: accessTokenCookie.length,
      refreshTokenCookie_length: refreshTokenCookie.length,
      accessTokenCookie_preview: accessTokenCookie.substring(0, 50) + '...',
      refreshTokenCookie_preview: refreshTokenCookie.substring(0, 50) + '...'
    })

    // Create response with cookies
    const responseData: AuthResponse = { 
      success: true, 
      clubId: club.id, 
      homefield: club.homefield || undefined
    }
    
    console.log('📤 Response data:', JSON.stringify(responseData, null, 2))
    
    const response = NextResponse.json<AuthResponse>(responseData)
    
    response.headers.append('Set-Cookie', accessTokenCookie)
    response.headers.append('Set-Cookie', refreshTokenCookie)

    console.log('🍪 Cookies set on response headers')
    console.log('📤 Final response headers (Set-Cookie):', response.headers.getSetCookie())
    console.log('=== TABLET AUTH SIGNIN END ===')

    return response

  } catch (error) {
    console.error('💥 Error in tablet auth signin:', error)
    console.error('💥 Error stack:', error instanceof Error ? error.stack : 'No stack trace')
    return NextResponse.json<AuthResponse>(
      { success: false, error: 'Internal server error during authentication' },
      { status: 500 }
    )
  }
} 