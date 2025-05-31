import { NextResponse } from 'next/server'
import { serialize } from 'cookie';

// This route doesn't need to do much for JWTs stored in localStorage,
// as the client is responsible for clearing them.
// It serves as a conventional endpoint for the sign-out action.
export async function POST() {
  try {
    console.log("Tablet sign-out request received.")

    const accessTokenCookieName = process.env.TABLET_ACCESS_TOKEN_COOKIE_NAME || 'tablet-access-token';
    const refreshTokenCookieName = process.env.TABLET_REFRESH_TOKEN_COOKIE_NAME || 'tablet-refresh-token';

    // To clear a cookie, set its Max-Age to 0 or a past date
    const clearAccessTokenCookie = serialize(accessTokenCookieName, '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: -1, // Or 0
      sameSite: 'lax',
    });

    const clearRefreshTokenCookie = serialize(refreshTokenCookieName, '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: -1, // Or 0
      sameSite: 'lax',
    });

    const response = NextResponse.json({ message: 'Sign-out successful' });
    response.headers.append('Set-Cookie', clearAccessTokenCookie);
    response.headers.append('Set-Cookie', clearRefreshTokenCookie);

    return response;
  } catch (error) {
    console.error('Error in tablet signout:', error)
    return NextResponse.json(
      { error: 'Internal server error during sign-out' },
      { status: 500 },
    )
  }
} 