import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getStartOfTimezoneDayUTC, getEndOfTimezoneDayUTC } from '@/lib/time-utils';

interface LogbookResponse {
  success: boolean;
  error?: string;
  data?: any[];
  count?: number;
}

export async function GET(request: NextRequest): Promise<NextResponse<LogbookResponse>> {
  try {
    const url = new URL(request.url);
    
    const apiKey = request.headers.get('x-api-key');
    const dateParam = url.searchParams.get('date');
    const dsvuId = url.searchParams.get('dsvu_id');
    const airfield = url.searchParams.get('airfield');
    
    if (!apiKey) {
      return NextResponse.json<LogbookResponse>(
        {
          success: false,
          error: 'API key is required. Please provide x-api-key header.'
        },
        { status: 401 }
      );
    }
    
    // If searching for all flights for a DSVU ID, date is not required
    if (!dateParam && !dsvuId) {
      return NextResponse.json<LogbookResponse>(
        {
          success: false,
          error: 'Date parameter is required when not searching by DSVU ID. Format: YYYY-MM-DD'
        },
        { status: 400 }
      );
    }
    
    const club = await prisma.club.findFirst({
      where: {
        club_api_key: apiKey
      },
      select: {
        id: true,
        name: true,
        homefield: true,
        allowed_airfields: true
      }
    });
    
    if (!club) {
      return NextResponse.json<LogbookResponse>(
        {
          success: false,
          error: 'Invalid API key'
        },
        { status: 401 }
      );
    }
    
    let whereClause: any = {
      clubId: club.id,
      deleted: false
    };
    
    // Only apply date filtering if a date is provided
    if (dateParam) {
      const requestedDate = new Date(dateParam);
      if (isNaN(requestedDate.getTime())) {
        return NextResponse.json<LogbookResponse>(
          {
            success: false,
            error: 'Invalid date format. Please use YYYY-MM-DD'
          },
          { status: 400 }
        );
      }
      
      const startOfDay = getStartOfTimezoneDayUTC(requestedDate);
      const endOfDay = getEndOfTimezoneDayUTC(requestedDate);
      
      whereClause.OR = [
        {
          takeoff_time: {
            gte: startOfDay,
            lte: endOfDay
          }
        },
        {
          landing_time: {
            gte: startOfDay,
            lte: endOfDay
          }
        }
      ];
    }
    
    if (airfield) {
      whereClause.AND = whereClause.AND || [];
      whereClause.AND.push({
        OR: [
          { takeoff_airfield: airfield },
          { landing_airfield: airfield },
          { operating_airfield: airfield }
        ]
      });
    }
    
    if (dsvuId) {
      const pilot = await prisma.pilot.findFirst({
        where: {
          dsvu_id: dsvuId
        },
        select: {
          id: true
        }
      });
      
      if (pilot) {
        whereClause.AND = whereClause.AND || [];
        whereClause.AND.push({
          OR: [
            { pilot1Id: pilot.id },
            { pilot2Id: pilot.id }
          ]
        });
      } else {
        // No pilot found with this DSVU ID, return empty result
        return NextResponse.json<LogbookResponse>({
          success: true,
          data: [],
          count: 0
        });
      }
    }
    
    const flights = await prisma.flightLogbook.findMany({
      where: whereClause,
      include: {
        pilot1: {
          select: {
            id: true,
            firstname: true,
            lastname: true,
            dsvu_id: true
          }
        },
        pilot2: {
          select: {
            id: true,
            firstname: true,
            lastname: true,
            dsvu_id: true
          }
        },
        plane: {
          select: {
            id: true,
            registration_id: true,
            flarm_id: true,
            competition_id: true,
            type: true,
            is_twoseater: true,
            is_guest: true,
            flight_time: true,
            starts: true,
            year_produced: true,
            notes: true
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
        takeoff_time: 'asc'
      }
    });
    
    const transformedFlights = flights.map(flight => ({
      id: flight.id,
      flarm_id: flight.flarm_id,
      registration: flight.registration,
      type: flight.type,
      competition_number: flight.competition_number,
      pilot1: flight.pilot1 ? {
        id: flight.pilot1.id,
        full_name: `${flight.pilot1.firstname} ${flight.pilot1.lastname}`,
        dsvu_id: flight.pilot1.dsvu_id
      } : null,
      guest_pilot1_name: flight.guest_pilot1_name,
      pilot2: flight.pilot2 ? {
        id: flight.pilot2.id,
        full_name: `${flight.pilot2.firstname} ${flight.pilot2.lastname}`,
        dsvu_id: flight.pilot2.dsvu_id
      } : null,
      guest_pilot2_name: flight.guest_pilot2_name,
      is_school_flight: flight.is_school_flight,
      launch_method: flight.launch_method,
      plane: flight.plane,
      club: flight.club,
      takeoff_time: flight.takeoff_time,
      landing_time: flight.landing_time,
      flight_duration: flight.flight_duration,
      flight_distance: flight.flight_distance,
      max_altitude: flight.max_altitude,
      max_speed: flight.max_speed,
      takeoff_airfield: flight.takeoff_airfield,
      landing_airfield: flight.landing_airfield,
      operating_airfield: flight.operating_airfield,
      notes: flight.notes,
      status: flight.status,
      createdAt: flight.createdAt,
      updatedAt: flight.updatedAt
    }));
    
    return NextResponse.json<LogbookResponse>({
      success: true,
      data: transformedFlights,
      count: transformedFlights.length
    });
    
  } catch (error) {
    console.error('Error fetching logbook data:', error);
    return NextResponse.json<LogbookResponse>(
      {
        success: false,
        error: 'Failed to fetch logbook data'
      },
      { status: 500 }
    );
  }
}