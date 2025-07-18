import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import type { ApiResponse } from '@/types/tablet-api';

interface AirfieldResponse {
  id: string;
  code: string;
  name: string;
  type: string;
}

interface FetchAirfieldsResponse extends ApiResponse {
  airfields?: AirfieldResponse[];
}

export async function GET(request: NextRequest): Promise<NextResponse<FetchAirfieldsResponse>> {
  try {
    // Fetch all airfields from the database
    const airfields = await prisma.dkAirfields.findMany({
      select: {
        id: true,
        ident: true,
        name: true,
        icao: true,
        type: true
      },
      orderBy: { name: 'asc' }
    });

    // Transform to use ICAO codes (not ident codes)
    const transformedAirfields: AirfieldResponse[] = airfields.map(airfield => ({
      id: airfield.id,
      code: airfield.icao,  // Use ICAO code, not ident
      name: airfield.name,
      type: airfield.type
    }));

    return NextResponse.json<FetchAirfieldsResponse>({
      success: true,
      airfields: transformedAirfields
    });

  } catch (error: any) {
    console.error('Error fetching airfields:', error);
    
    return NextResponse.json<FetchAirfieldsResponse>(
      { success: false, error: 'Failed to fetch airfields: ' + error.message },
      { status: 500 }
    );
  }
}