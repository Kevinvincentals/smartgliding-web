import { NextRequest, NextResponse } from 'next/server';
import type { JWTPayload, ApiResponse } from '@/types/tablet-api';

interface UserInfoResponse extends ApiResponse {
  selectedAirfield?: string;
  homefield?: string;
  clubId?: string;
  allowedAirfields?: string[];
}

export async function GET(request: NextRequest): Promise<NextResponse<UserInfoResponse>> {
  try {
    // Extract JWT payload from headers (set by middleware)
    const jwtPayloadString = request.headers.get('x-jwt-payload');
    if (!jwtPayloadString) {
      return NextResponse.json<UserInfoResponse>(
        { 
          success: false, 
          error: 'Authentication token not found.' 
        }, 
        { status: 401 }
      );
    }
    
    const jwtPayload: JWTPayload = JSON.parse(jwtPayloadString);
    
    return NextResponse.json<UserInfoResponse>({
      success: true,
      selectedAirfield: jwtPayload.selectedAirfield,
      homefield: jwtPayload.homefield,
      clubId: jwtPayload.clubId || jwtPayload.id,
      allowedAirfields: jwtPayload.allowedAirfields
    });
    
  } catch (error) {
    console.error('Error fetching user info:', error);
    return NextResponse.json<UserInfoResponse>(
      { 
        success: false, 
        error: 'Failed to fetch user info' 
      },
      { status: 500 }
    );
  }
}