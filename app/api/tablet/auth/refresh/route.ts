import { NextResponse } from 'next/server'
import { generateTokens, verifyToken, JWTPayload } from '@/lib/jwt'
import { serialize } from 'cookie';
import { cookies } from 'next/headers';

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    const refreshTokenCookieName = process.env.TABLET_REFRESH_TOKEN_COOKIE_NAME || 'tablet-refresh-token';
    const refreshToken = cookieStore.get(refreshTokenCookieName)?.value;

    if (!refreshToken) {
      return NextResponse.json({ error: 'Refresh token not found in cookies' }, { status: 401 });
    }

    let oldPayload: JWTPayload;
    try {
      oldPayload = await verifyToken(refreshToken);
    } catch (error) {
      console.warn('Invalid refresh token from cookie during tablet refresh attempt:', error);
      // Clear the invalid refresh token cookie
      const clearRefreshTokenCookie = serialize(refreshTokenCookieName, '', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: -1,
        sameSite: 'lax',
      });
      const errResponse = NextResponse.json({ error: 'Invalid or expired refresh token' }, { status: 401 });
      errResponse.headers.append('Set-Cookie', clearRefreshTokenCookie);
      return errResponse;
    }

    if (!oldPayload.id || !oldPayload.homefield) { 
      console.error('Refresh token payload is missing required tablet fields (id/homefield)', oldPayload);
      return NextResponse.json({ error: 'Invalid refresh token payload' }, { status: 401 });
    }

    const newAccessTokenPayload: JWTPayload = {
      id: oldPayload.id,
      clubId: oldPayload.id,
      homefield: oldPayload.homefield,
    };

    // generateTokens now returns accessTokenExpiresIn
    const { accessToken: newAccessToken, accessTokenExpiresIn } = await generateTokens(newAccessTokenPayload);

    const accessTokenCookieName = process.env.TABLET_ACCESS_TOKEN_COOKIE_NAME || 'tablet-access-token';
    const newAccessTokenCookie = serialize(accessTokenCookieName, newAccessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: accessTokenExpiresIn, // Use the actual expiration time
      sameSite: 'lax',
    });

    // Note: Refresh token rotation is not implemented here. 
    // If you implement it, you'd also generate and set a new refresh token cookie.

    const response = NextResponse.json({ success: true, message: 'Access token refreshed' });
    response.headers.append('Set-Cookie', newAccessTokenCookie);
    return response;

  } catch (error) {
    console.error('Error in tablet token refresh:', error);
    return NextResponse.json(
      { error: 'Internal server error during token refresh' },
      { status: 500 },
    );
  }
} 