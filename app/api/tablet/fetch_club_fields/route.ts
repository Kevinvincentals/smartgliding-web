import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { clubFieldsQuerySchema, validateQueryParams } from '@/lib/validations/tablet-api';
import type { ApiResponse, JWTPayload } from '@/types/tablet-api';

/**
 * Club fields response
 */
interface ClubFieldsApiResponse extends ApiResponse {
  airfieldOptions?: Array<{
    id: string
    name: string
  }>
}

export async function GET(request: NextRequest): Promise<NextResponse<ClubFieldsApiResponse>> {
  try {
    const url = new URL(request.url);
    
    // Validate query parameters with Zod
    const validation = validateQueryParams(clubFieldsQuerySchema, url.searchParams);
    if (!validation.success) {
      return NextResponse.json<ClubFieldsApiResponse>(
        { 
          success: false, 
          error: validation.error,
          ...(validation.details && { details: validation.details.join(', ') })
        }, 
        { status: 400 }
      );
    }

    const queryParams = validation.data;

    const jwtPayloadString = request.headers.get('x-jwt-payload');
    if (!jwtPayloadString) {
      return NextResponse.json<ClubFieldsApiResponse>(
        { success: false, error: 'Authentication token not found.' }, 
        { status: 401 }
      );
    }

    const jwtPayload: JWTPayload = JSON.parse(jwtPayloadString);
    const selectedAirfield = jwtPayload.selectedAirfield || jwtPayload.homefield || jwtPayload.club?.homefield;

    if (!selectedAirfield) {
      return NextResponse.json<ClubFieldsApiResponse>(
        { success: false, error: 'Selected airfield not found in authentication token.' }, 
        { status: 401 }
      );
    }

    console.log(`Fetching club fields for selectedAirfield: ${selectedAirfield}, includeInactive: ${queryParams.includeInactive}`);

    // Get the selected airfield and create airfield options
    const airfieldOptions = [
      { id: selectedAirfield, name: `${selectedAirfield} - ${getAirfieldName(selectedAirfield)}` }
    ];

    // If includeInactive is true, we could add more fields here from database
    // For now, just return the homefield as that's what the original did
    
    return NextResponse.json<ClubFieldsApiResponse>({
      success: true,
      airfieldOptions
    });
  } catch (error: unknown) {
    console.error('Error fetching club fields:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return NextResponse.json<ClubFieldsApiResponse>(
      { success: false, error: `Failed to fetch club fields: ${errorMessage}` },
      { status: 500 }
    );
  }
}

// Helper function to get airfield name from ICAO code
function getAirfieldName(icao: string): string {
  const airfieldNames: Record<string, string> = {
    'EKFS': 'Vøjstrup',
    'EKAB': 'Arnborg',
    // Add more airfields as needed
  };
  
  return airfieldNames[icao] || icao;
} 