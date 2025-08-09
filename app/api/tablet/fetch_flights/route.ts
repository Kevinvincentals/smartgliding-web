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
  club: {
    id: string;
    name: string;
    homefield: string | null;
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
  isOwnFlight: boolean;
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
  club: {
    id: string;
    name: string;
    homefield: string | null;
  } | null;
}

/**
 * API response for flights endpoint
 */
interface FlightsApiResponse extends ApiResponse<FlightResponse[]> {
  count: number;
  flights: FlightResponse[];
}

/**
 * Fetches flights for a specific day and airfield
 * Returns flights that took off, landed, or were created today
 */
export async function GET(request: NextRequest): Promise<NextResponse<FlightsApiResponse>> {
  try {
    const url = new URL(request.url);
    
    // Validate query parameters with Zod
    const validation = validateQueryParams(flightQuerySchema, url.searchParams);
    if (!validation.success) {
      return NextResponse.json<FlightsApiResponse>(
        { 
          success: false, 
          error: validation.error,
          ...(validation.details && { details: validation.details.join(', ') }),
          count: 0,
          flights: []
        }, 
        { status: 400 }
      );
    }

    const queryParams = validation.data;

    // Extract JWT payload from headers (set by middleware)
    const jwtPayloadString = request.headers.get('x-jwt-payload');
    if (!jwtPayloadString) {
      return NextResponse.json<FlightsApiResponse>(
        { 
          success: false, 
          error: 'Authentication token not found.',
          count: 0,
          flights: []
        }, 
        { status: 401 }
      );
    }
    
    const jwtPayload: JWTPayload = JSON.parse(jwtPayloadString);
    const clubId = jwtPayload.clubId || jwtPayload.id;
    const selectedAirfield = jwtPayload.selectedAirfield || jwtPayload.homefield || queryParams.airfield;

    if (!clubId) {
      return NextResponse.json<FlightsApiResponse>(
        { 
          success: false, 
          error: 'Club ID not found in authentication token.',
          count: 0,
          flights: []
        }, 
        { status: 401 }
      );
    }

    // Calculate date range for today in Danish timezone
    const today = new Date();
    const startOfToday = getStartOfTimezoneDayUTC(today);
    const endOfToday = getEndOfTimezoneDayUTC(today);

    // Build query conditions using same logic as working historical flights and PDF endpoints
    const dateConditions = {
      OR: [
        // Flights that took off today
        {
          takeoff_time: {
            gte: startOfToday,
            lte: endOfToday
          }
        },
        // Flights that landed today
        {
          landing_time: {
            gte: startOfToday,
            lte: endOfToday
          }
        },
        // Flights created today but not yet taken off
        {
          createdAt: {
            gte: startOfToday,
            lte: endOfToday
          }
        },
        // Pending flights with no times set regardless of creation date
        {
          takeoff_time: null,
          landing_time: null,
          status: 'PENDING' as const
        }
      ]
    };

    const baseWhereClause: Prisma.FlightLogbookWhereInput = {
      AND: [
        // Date conditions
        dateConditions,
        // Include pending flights OR flights that have actually happened (INFLIGHT, LANDED, or COMPLETED)
        {
          OR: [
            { status: 'PENDING' },
            {
              status: {
                in: ['INFLIGHT', 'LANDED', 'COMPLETED']
              }
            }
          ]
        }
      ],
      // Always filter by the selected airfield
      OR: [
        { takeoff_airfield: selectedAirfield },
        { landing_airfield: selectedAirfield },
        { operating_airfield: selectedAirfield }
      ]
    };

    // Create combined query conditions for active and deleted flights
    const whereClause: Prisma.FlightLogbookWhereInput = {
      ...baseWhereClause,
      deleted: queryParams.includeDeleted ? undefined : false, // Include deleted only if requested
    };

    // Single optimized query that fetches all flights (active and deleted if requested) with private plane data
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
          },
          club: {
            select: {
              id: true,
              name: true,
              homefield: true
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
          date: startOfToday,
          planeId: { not: null } // Only get records with valid plane references
        },
        select: {
          planeId: true
        }
      })
    ]);
    
    const privatePlaneIds = new Set(privatePlanes.map((pp: any) => pp.planeId).filter(Boolean));

    // Transform flights for response with club visibility information
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
      
      // Check if this plane is marked as private for today
      const isPrivatePlane = flight.planeId ? privatePlaneIds.has(flight.planeId) : false;
      
      // Check if this flight belongs to the current club
      const isOwnFlight = flight.clubId === clubId;
      
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
        isOwnFlight: isOwnFlight,
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
        },
        club: flight.club
      };
    });

    return NextResponse.json<FlightsApiResponse>({
      success: true,
      count: flightsWithStatus.length,
      flights: flightsWithStatus
    });
  } catch (error) {
    console.error('Error fetching flights:', error);
    return NextResponse.json<FlightsApiResponse>(
      { 
        success: false, 
        error: 'Failed to fetch flights',
        count: 0,
        flights: []
      },
      { status: 500 }
    );
  }
} 