import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import type { ApiResponse } from '@/types/tablet-api';

interface CurrentFlightApiResponse extends ApiResponse {
  flightLogbookId?: string;
  aircraftRegistration?: string;
  isCurrentFlight?: boolean;
}

export async function GET(request: NextRequest): Promise<NextResponse<CurrentFlightApiResponse>> {
  try {
    const url = new URL(request.url);
    const aircraftRegistration = url.searchParams.get('registration');
    
    if (!aircraftRegistration) {
      return NextResponse.json<CurrentFlightApiResponse>(
        { 
          success: false, 
          error: 'Aircraft registration is required'
        }, 
        { status: 400 }
      );
    }

    console.log(`Finding most recent flight for aircraft: ${aircraftRegistration}`);

    // Find the most recent flight for this aircraft, regardless of completion status
    const mostRecentFlight = await prisma.flightLogbook.findFirst({
      where: {
        registration: aircraftRegistration,
        takeoff_time: { not: null }, // Must have a takeoff time to have flight data
        deleted: { not: true }
      },
      orderBy: {
        takeoff_time: 'desc' // Get the most recent flight
      }
    });

    if (mostRecentFlight) {
      const isCurrentFlight = mostRecentFlight.landing_time === null;
      console.log(`Found ${isCurrentFlight ? 'ongoing' : 'completed'} flight: ${mostRecentFlight.id} for aircraft: ${aircraftRegistration}`);
      
      return NextResponse.json<CurrentFlightApiResponse>({
        success: true,
        flightLogbookId: mostRecentFlight.id,
        aircraftRegistration: aircraftRegistration,
        isCurrentFlight: isCurrentFlight
      });
    }

    // No flight found with takeoff time
    return NextResponse.json<CurrentFlightApiResponse>({
      success: false,
      error: 'No flight found for this aircraft'
    });

  } catch (error: unknown) {
    console.error('Error finding current flight:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return NextResponse.json<CurrentFlightApiResponse>(
      { success: false, error: `Failed to find current flight: ${errorMessage}` },
      { status: 500 }
    );
  }
} 