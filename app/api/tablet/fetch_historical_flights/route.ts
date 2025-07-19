import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import type { FlightLogbook, Prisma } from '@prisma/client';
import { getStartOfTimezoneDayUTC, getEndOfTimezoneDayUTC } from '@/lib/time-utils';
import type { JWTPayload, ApiResponse, FlightQueryParams } from '@/types/tablet-api';
import type { FlightStatus } from '@/types/flight';
import { flightQuerySchema, validateQueryParams } from '@/lib/validations/tablet-api';

/**
 * Enhanced flight data with related entities
 */
interface FlightWithDetails extends Omit<FlightLogbook, 'status'> {
  pilot1: {
    id: string;
    firstname: string;
    lastname: string;
  } | null;
  pilot2: {
    id: string;
    firstname: string;
    lastname: string;
  } | null;
  plane: {
    id: string;
    registration_id: string;
    type: string;
    competition_id: string | null;
    is_twoseater: boolean;
    flarm_id: string | null;
  } | null;
  status: FlightStatus;
  guest_pilot1_name: string | null;
  guest_pilot2_name: string | null;
}

/**
 * Response format for flight data
 */
interface FlightResponse {
  id: string;
  flarm_id: string | null;
  registration: string | null;
  type: string | null;
  competition_number: string | null;
  pilot1Id: string | null;
  guest_pilot1_name: string | null;
  pilot2Id: string | null;
  guest_pilot2_name: string | null;
  is_school_flight: boolean;
  launch_method: string | null;
  planeId: string | null;
  clubId: string;
  takeoff_time: Date | null;
  landing_time: Date | null;
  flight_duration: number | null;
  takeoff_airfield: string | null;
  landing_airfield: string | null;
  notes: string | null;
  status: FlightStatus;
  deleted: boolean | null;
  createdAt: Date;
  updatedAt: Date;
  isPrivatePlane: boolean;
  pilot1: {
    id: string;
    firstname: string;
    lastname: string;
  } | null;
  pilot2: {
    id: string;
    firstname: string;
    lastname: string;
  } | null;
  plane: {
    id: string | null;
    registration_id: string;
    type: string;
    competition_id: string | null;
    is_twoseater: boolean;
    flarm_id: string | null;
    has_valid_flarm: boolean;
  };
}

/**
 * API response for historical flights endpoint
 */
interface HistoricalFlightsApiResponse extends ApiResponse<FlightResponse[]> {
  count: number;
  flights: FlightResponse[];
  date: string;
}

/**
 * Fetches flights for a specific historical date
 * Returns flights that took off, landed, or were created on the specified date
 */
export async function GET(request: NextRequest): Promise<NextResponse<HistoricalFlightsApiResponse>> {
  try {
    const url = new URL(request.url);
    
    // Get the date parameter
    const dateParam = url.searchParams.get('date');
    if (!dateParam) {
      return NextResponse.json<HistoricalFlightsApiResponse>(
        { 
          success: false, 
          error: 'Date parameter is required (format: YYYY-MM-DD)',
          count: 0,
          flights: [],
          date: ''
        }, 
        { status: 400 }
      );
    }

    // Validate date format
    const targetDate = new Date(dateParam);
    if (isNaN(targetDate.getTime())) {
      return NextResponse.json<HistoricalFlightsApiResponse>(
        { 
          success: false, 
          error: 'Invalid date format. Use YYYY-MM-DD',
          count: 0,
          flights: [],
          date: dateParam
        }, 
        { status: 400 }
      );
    }

    // Validate includeDeleted parameter
    const includeDeleted = url.searchParams.get('includeDeleted') === 'true';

    // Extract JWT payload from headers (set by middleware)
    const jwtPayloadString = request.headers.get('x-jwt-payload');
    if (!jwtPayloadString) {
      return NextResponse.json<HistoricalFlightsApiResponse>(
        { 
          success: false, 
          error: 'Authentication token not found.',
          count: 0,
          flights: [],
          date: dateParam
        }, 
        { status: 401 }
      );
    }
    
    const jwtPayload: JWTPayload = JSON.parse(jwtPayloadString);
    const clubId = jwtPayload.clubId || jwtPayload.id;
    const homefield = jwtPayload.homefield || jwtPayload.club?.homefield;

    if (!clubId) {
      return NextResponse.json<HistoricalFlightsApiResponse>(
        { 
          success: false, 
          error: 'Club ID not found in authentication token.',
          count: 0,
          flights: [],
          date: dateParam
        }, 
        { status: 401 }
      );
    }

    // Calculate date range for the specified date in Danish timezone
    const startOfTargetDate = getStartOfTimezoneDayUTC(targetDate);
    const endOfTargetDate = getEndOfTimezoneDayUTC(targetDate);

    // Build query conditions using same logic as working statistics endpoint
    const dateConditions = {
      OR: [
        // Flights that took off on target date
        {
          takeoff_time: {
            gte: startOfTargetDate,
            lte: endOfTargetDate
          }
        },
        // Flights that landed on target date
        {
          landing_time: {
            gte: startOfTargetDate,
            lte: endOfTargetDate
          }
        },
        // Flights created on target date but not yet taken off
        {
          createdAt: {
            gte: startOfTargetDate,
            lte: endOfTargetDate
          }
        }
      ]
    };

    const baseWhereClause: Prisma.FlightLogbookWhereInput = {
      AND: [
        // Date conditions
        dateConditions,
        // Only include flights that have actually happened (INFLIGHT, LANDED, or COMPLETED)
        {
          status: {
            in: ['INFLIGHT', 'LANDED', 'COMPLETED']
          }
        }
      ],
      // Either match club OR match airfield (same logic as fetch_statistics)
      OR: [
        // Either clubId matches
        { clubId: clubId },
        // OR the airfield matches our homefield (either takeoff or landing)
        ...(homefield ? [
          {
            OR: [
              { takeoff_airfield: homefield },
              { landing_airfield: homefield }
            ]
          }
        ] : [])
      ]
    };

    // Create combined query conditions for active and deleted flights
    const whereClause: Prisma.FlightLogbookWhereInput = {
      ...baseWhereClause,
      deleted: includeDeleted ? undefined : false, // Include deleted only if requested
    };

    // Single optimized query that fetches all flights with private plane data
    const [flights, privatePlanes] = await Promise.all([
      prisma.flightLogbook.findMany({
        where: whereClause,
        include: {
          pilot1: {
            select: {
              id: true,
              firstname: true,
              lastname: true,
            }
          },
          pilot2: {
            select: {
              id: true,
              firstname: true,
              lastname: true,
            }
          },
          plane: {
            select: {
              id: true,
              registration_id: true,
              type: true,
              competition_id: true,
              is_twoseater: true,
              flarm_id: true
            }
          }
        },
        orderBy: {
          takeoff_time: 'desc'
        }
      }),
      prisma.dailyPrivatePlanes.findMany({
        where: {
          clubId,
          date: startOfTargetDate,
          planeId: { not: null } // Only get records with valid plane references
        },
        select: {
          planeId: true
        }
      })
    ]);
    
    const privatePlaneIds = new Set(privatePlanes.map((pp: any) => pp.planeId).filter(Boolean));

    // Transform flights for response
    const flightsWithStatus: FlightResponse[] = flights.map(flight => {
      let status: FlightStatus = 'pending';
      
      if (flight.deleted) {
        status = 'deleted';
      } else if (flight.takeoff_time && flight.landing_time) {
        status = 'completed';
      } else if (flight.takeoff_time && !flight.landing_time) {
        status = 'in_flight';
      } else if (!flight.takeoff_time && flight.landing_time) {
        status = 'landing_only';
      }
      
      const flarmId = flight.flarm_id || (flight.plane?.flarm_id || null);
      const hasValidFlarm = Boolean(flarmId && flarmId !== 'none' && flarmId !== 'unknown');
      const isDoubleSeater = flight.plane ? flight.plane.is_twoseater : true;
      
      // Check if this plane is marked as private for the target date
      const isPrivatePlane = flight.planeId ? privatePlaneIds.has(flight.planeId) : false;
      
      // Handle pilot data (club members vs guests)
      const pilot1 = flight.pilot1 || (flight.guest_pilot1_name ? {
        id: 'guest',
        firstname: flight.guest_pilot1_name,
        lastname: '',
      } : null);
      
      const pilot2 = flight.pilot2 || (flight.guest_pilot2_name ? {
        id: 'guest',
        firstname: flight.guest_pilot2_name,
        lastname: '',
      } : null);
      
      return {
        id: flight.id,
        flarm_id: flarmId,
        registration: flight.registration,
        type: flight.type,
        competition_number: flight.competition_number,
        pilot1Id: flight.pilot1Id,
        guest_pilot1_name: flight.guest_pilot1_name,
        pilot2Id: flight.pilot2Id,
        guest_pilot2_name: flight.guest_pilot2_name,
        is_school_flight: flight.is_school_flight ?? false,
        launch_method: flight.launch_method,
        planeId: flight.planeId,
        clubId: flight.clubId || clubId,
        takeoff_time: flight.takeoff_time,
        landing_time: flight.landing_time,
        flight_duration: flight.flight_duration,
        takeoff_airfield: flight.takeoff_airfield,
        landing_airfield: flight.landing_airfield,
        notes: flight.notes,
        status,
        deleted: flight.deleted,
        createdAt: flight.createdAt,
        updatedAt: flight.updatedAt,
        isPrivatePlane: isPrivatePlane,
        pilot1,
        pilot2,
        plane: flight.plane ? {
          ...flight.plane,
          is_twoseater: isDoubleSeater,
          has_valid_flarm: hasValidFlarm
        } : {
          id: null,
          registration_id: flight.registration || 'Unknown',
          type: flight.type || 'Unknown',
          competition_id: flight.competition_number || null,
          is_twoseater: isDoubleSeater,
          flarm_id: flarmId,
          has_valid_flarm: hasValidFlarm
        }
      };
    });

    return NextResponse.json<HistoricalFlightsApiResponse>({
      success: true,
      count: flightsWithStatus.length,
      flights: flightsWithStatus,
      date: dateParam
    });
  } catch (error) {
    console.error('Error fetching historical flights:', error);
    return NextResponse.json<HistoricalFlightsApiResponse>(
      { 
        success: false, 
        error: 'Failed to fetch historical flights',
        count: 0,
        flights: [],
        date: ''
      },
      { status: 500 }
    );
  }
}