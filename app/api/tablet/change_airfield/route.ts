import { NextRequest, NextResponse } from 'next/server';
import { SignJWT } from 'jose';
import { serialize } from 'cookie';
import type { ApiResponse } from '@/types/tablet-api';

interface ChangeAirfieldRequest {
  selectedAirfield: string;
}

interface ChangeAirfieldResponse extends ApiResponse {
  selectedAirfield?: string;
}

export async function POST(request: NextRequest): Promise<NextResponse<ChangeAirfieldResponse>> {
  try {
    // Parse request body
    const body: ChangeAirfieldRequest = await request.json();
    const { selectedAirfield } = body;

    if (!selectedAirfield) {
      return NextResponse.json<ChangeAirfieldResponse>(
        { success: false, error: 'Flyveplads skal vælges' },
        { status: 400 }
      );
    }

    // Get JWT payload from headers (set by middleware)
    const jwtPayloadString = request.headers.get('x-jwt-payload');
    if (!jwtPayloadString) {
      return NextResponse.json<ChangeAirfieldResponse>(
        { success: false, error: 'Authentication token not found.' },
        { status: 401 }
      );
    }

    const jwtPayload = JSON.parse(jwtPayloadString);
    const clubId = jwtPayload.clubId || jwtPayload.id;
    const pin = jwtPayload.pin;

    if (!clubId) {
      return NextResponse.json<ChangeAirfieldResponse>(
        { success: false, error: 'Club ID not found in authentication token.' },
        { status: 401 }
      );
    }

    // Create updated JWT payload with new selected airfield
    const updatedPayload = {
      ...jwtPayload,
      selectedAirfield,
      // Update the timestamp to show when the airfield was changed
      airfieldChangedAt: new Date().toISOString()
    };

    // Get JWT secret
    const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-key-change-this-in-production';
    const secret = new TextEncoder().encode(JWT_SECRET);

    // Sign new JWT token with updated payload
    const token = await new SignJWT(updatedPayload)
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('24h')
      .sign(secret);

    // Set the new token in HTTP-only cookie
    const useSecureCookies = process.env.NODE_ENV === 'production';
    const tokenCookie = serialize('tablet-access-token', token, {
      httpOnly: true,
      secure: useSecureCookies,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7, // 7 days like the original
      path: '/'
    });

    const response = NextResponse.json<ChangeAirfieldResponse>({
      success: true,
      selectedAirfield
    });

    response.headers.append('Set-Cookie', tokenCookie);

    return response;

  } catch (error: any) {
    console.error('Error changing airfield:', error);
    
    return NextResponse.json<ChangeAirfieldResponse>(
      { success: false, error: 'Kunne ikke skifte flyveplads: ' + error.message },
      { status: 500 }
    );
  }
}