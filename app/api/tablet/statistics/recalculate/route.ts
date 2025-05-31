import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getStartOfTimezoneDayUTC, getEndOfTimezoneDayUTC } from '@/lib/time-utils';
import { calculateFlightStatistics } from '@/lib/flight-stats';
import { JWTPayload } from '@/lib/jwt';
import { statisticsRecalculationSchema, validateRequestBody } from '@/lib/validations/tablet-api';
import type { ApiResponse } from '@/types/tablet-api';

/**
 * Statistics recalculation response
 */
interface RecalculationApiResponse extends ApiResponse {
  message?: string
  results?: {
    totalFlights: number
    processed: number
    updated: number
    failed: number
    flights: Array<{
      id: string
      registration: string | null
      success: boolean
      error?: string
      stats?: {
        maxAltitude: number | null
        maxSpeed: number | null
        distance: number | null
      }
    }>
  }
}

export async function POST(request: NextRequest): Promise<NextResponse<RecalculationApiResponse>> {
  try {
    // Parse and validate request body (if any)
    let validatedData: any = { recalculateAll: true }; // Default behavior
    
    try {
      const body = await request.json();
      const validation = validateRequestBody(statisticsRecalculationSchema, body);
      if (!validation.success) {
        return NextResponse.json<RecalculationApiResponse>(
          { 
            success: false, 
            error: validation.error,
            ...(validation.details && { details: validation.details.join(', ') })
          },
          { status: 400 }
        );
      }
      validatedData = validation.data;
    } catch (e) {
      // If no body or invalid JSON, use defaults
      console.log('No valid request body provided, using defaults');
    }

    // Get clubId from JWT
    const jwtPayloadString = request.headers.get('x-jwt-payload');
    if (!jwtPayloadString) {
      return NextResponse.json<RecalculationApiResponse>(
        { success: false, error: 'Authentication token not found.' }, 
        { status: 401 }
      );
    }

    const jwtPayload: JWTPayload = JSON.parse(jwtPayloadString);
    const clubId = jwtPayload.clubId || jwtPayload.id;

    if (!clubId) {
      return NextResponse.json<RecalculationApiResponse>(
        { success: false, error: 'Club ID not found in authentication token.' }, 
        { status: 401 }
      );
    }

    console.log(`Recalculating statistics for club ID: ${clubId}, params:`, validatedData);

    // Determine date range
    let startOfTargetDay: Date;
    let endOfTargetDay: Date;
    
    if (validatedData.date) {
      const targetDate = new Date(validatedData.date);
      startOfTargetDay = getStartOfTimezoneDayUTC(targetDate);
      endOfTargetDay = getEndOfTimezoneDayUTC(targetDate);
    } else {
      // Default to today
      const now = new Date();
      startOfTargetDay = getStartOfTimezoneDayUTC(now);
      endOfTargetDay = getEndOfTimezoneDayUTC(now);
    }

    console.log(`Recalculating statistics for flights between ${startOfTargetDay.toISOString()} and ${endOfTargetDay.toISOString()}`);

    // Build flight query
    let flightWhere: any = {
      clubId: clubId,
      // Only include flights that have both takeoff and landing times
      takeoff_time: { not: null },
      landing_time: { not: null },
      // Don't include deleted flights
      deleted: false
    };

    // Add specific flight IDs filter if provided
    if (validatedData.flightIds && validatedData.flightIds.length > 0) {
      flightWhere.id = { in: validatedData.flightIds };
    } else if (validatedData.recalculateAll) {
      // Add date range filter for recalculate all
      flightWhere.OR = [
        // Flights that took off in the target period
        {
          takeoff_time: {
            gte: startOfTargetDay,
            lte: endOfTargetDay
          }
        },
        // Flights that landed in the target period
        {
          landing_time: {
            gte: startOfTargetDay,
            lte: endOfTargetDay
          }
        }
      ];
    }

    // Fetch all completed flights matching criteria
    const flights = await prisma.flightLogbook.findMany({
      where: flightWhere,
      select: {
        id: true,
        registration: true, // For logging purposes
      }
    });

    console.log(`Found ${flights.length} completed flights for recalculation`);

    // Process each flight to recalculate its statistics
    const results = {
      totalFlights: flights.length,
      processed: 0,
      updated: 0,
      failed: 0,
      flights: [] as Array<{
        id: string,
        registration: string | null,
        success: boolean,
        error?: string,
        stats?: {
          maxAltitude: number | null,
          maxSpeed: number | null,
          distance: number | null
        }
      }>
    };

    for (const flight of flights) {
      try {
        console.log(`Recalculating statistics for flight ${flight.id} (${flight.registration || 'unknown registration'})`);
        
        // Calculate flight statistics
        const statistics = await calculateFlightStatistics(flight.id);
        
        if (statistics.calculationSuccessful) {
          // Update the flight with calculated statistics
          await prisma.$runCommandRaw({
            update: "flight_logbook",
            updates: [
              {
                q: { _id: { $oid: flight.id } },
                u: { 
                  $set: { 
                    flight_distance: statistics.distance,
                    max_altitude: statistics.maxAltitude,
                    max_speed: statistics.maxSpeed
                  } 
                },
              },
            ],
          });
          
          console.log(`Updated flight ${flight.id} with statistics:`, statistics);
          
          results.updated++;
          results.flights.push({
            id: flight.id,
            registration: flight.registration,
            success: true,
            stats: {
              maxAltitude: statistics.maxAltitude,
              maxSpeed: statistics.maxSpeed,
              distance: statistics.distance
            }
          });
        } else {
          console.log(`No valid FLARM data found for flight ${flight.id} or calculation failed`);
          
          results.failed++;
          results.flights.push({
            id: flight.id,
            registration: flight.registration,
            success: false,
            error: 'No valid FLARM data found or calculation failed'
          });
        }
      } catch (error: unknown) {
        console.error(`Error recalculating statistics for flight ${flight.id}:`, error);
        
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        results.failed++;
        results.flights.push({
          id: flight.id,
          registration: flight.registration,
          success: false,
          error: errorMessage
        });
      }
      
      results.processed++;
    }

    return NextResponse.json<RecalculationApiResponse>({
      success: true,
      message: `Recalculated statistics for ${results.processed} flights. Updated: ${results.updated}, Failed: ${results.failed}`,
      results
    });
  } catch (error: unknown) {
    console.error('Error recalculating flight statistics:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return NextResponse.json<RecalculationApiResponse>(
      { 
        success: false, 
        error: `Statistics recalculation failed: ${errorMessage}`
      },
      { status: 500 }
    );
  }
} 