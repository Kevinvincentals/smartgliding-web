import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { JWTPayload } from '@/lib/jwt';
import type { ApiResponse } from '@/types/tablet-api';

/**
 * API response for pilot logs endpoint
 */
interface PilotLogApiResponse extends ApiResponse {
  pilotLogs?: PilotLog[]
}

interface PilotLog {
  pilotId: string
  pilotName: string
  isGuest: boolean
  totalFlights: number
  totalFlightTime: number // in minutes
  recentFlights: SchoolFlight[]
}

interface SchoolFlight {
  id: string
  date: Date
  flightDuration: number | null // in minutes
  registration: string | null
  type: string | null
  launchMethod: string | null
  instructorName: string | null // name of the instructor (pilot2)
  takeoffTime: Date | null
  landingTime: Date | null
}

// GET handler to retrieve pilot logs for school flights
export async function GET(request: NextRequest): Promise<NextResponse<PilotLogApiResponse>> {
  try {
    const url = new URL(request.url);
    const dateParam = url.searchParams.get('date');
    const yearParam = url.searchParams.get('year');
    const allParam = url.searchParams.get('all');

    const jwtPayloadString = request.headers.get('x-jwt-payload');
    if (!jwtPayloadString) {
      return NextResponse.json<PilotLogApiResponse>(
        { success: false, error: 'Authentication token not found.' }, 
        { status: 401 }
      );
    }
    
    const jwtPayload: JWTPayload = JSON.parse(jwtPayloadString);
    const clubId = jwtPayload.clubId || jwtPayload.id;

    if (!clubId) {
      return NextResponse.json<PilotLogApiResponse>(
        { success: false, error: 'Club ID not found in authentication token.' }, 
        { status: 401 }
      );
    }

    // Build date filter based on query parameters
    let whereClause: any = {
      clubId,
      is_school_flight: true,
      deleted: false
    };
    
    if (allParam === 'true') {
      // No date filter for "all" option
    } else if (dateParam) {
      // Filter for specific date
      const startOfDay = new Date(dateParam);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(dateParam);
      endOfDay.setHours(23, 59, 59, 999);
      
      whereClause.createdAt = {
        gte: startOfDay,
        lte: endOfDay
      };
    } else if (yearParam) {
      // Filter for specific year
      const year = parseInt(yearParam);
      const startOfYear = new Date(year, 0, 1);
      const endOfYear = new Date(year, 11, 31, 23, 59, 59, 999);
      
      whereClause.createdAt = {
        gte: startOfYear,
        lte: endOfYear
      };
    } else {
      // Default: filter for today only
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const endOfToday = new Date();
      endOfToday.setHours(23, 59, 59, 999);
      
      whereClause.createdAt = {
        gte: today,
        lte: endOfToday
      };
    }

    // Query all school flights for this club with date filtering
    const schoolFlights = await prisma.flightLogbook.findMany({
      where: whereClause,
      include: {
        pilot1: {
          select: {
            id: true,
            firstname: true,
            lastname: true
          }
        },
        pilot2: {
          select: {
            id: true,
            firstname: true,
            lastname: true
          }
        },
        plane: {
          select: {
            registration_id: true,
            type: true
          }
        }
      },
      orderBy: [
        {
          takeoff_time: 'asc'
        },
        {
          createdAt: 'asc'
        }
      ]
    });

    // Group flights by pilot (only students - pilot1 and guest_pilot1_name)
    const pilotLogsMap = new Map<string, PilotLog>();

    for (const flight of schoolFlights) {
      // Process pilot1 if exists (student in front seat)
      if (flight.pilot1) {
        const pilotKey = `pilot_${flight.pilot1.id}`;
        if (!pilotLogsMap.has(pilotKey)) {
          pilotLogsMap.set(pilotKey, {
            pilotId: flight.pilot1.id,
            pilotName: `${flight.pilot1.firstname} ${flight.pilot1.lastname}`,
            isGuest: false,
            totalFlights: 0,
            totalFlightTime: 0,
            recentFlights: []
          });
        }
        
        const pilotLog = pilotLogsMap.get(pilotKey)!;
        pilotLog.totalFlights++;
        pilotLog.totalFlightTime += flight.flight_duration || 0;
        
        // Add to recent flights (limit to 10 most recent, but keep in chronological order)
        if (pilotLog.recentFlights.length < 10) {
          pilotLog.recentFlights.push({
            id: flight.id,
            date: flight.createdAt,
            flightDuration: flight.flight_duration,
            registration: flight.plane?.registration_id || flight.registration,
            type: flight.plane?.type || flight.type,
            launchMethod: flight.launch_method,
            instructorName: flight.pilot2 
              ? `${flight.pilot2.firstname} ${flight.pilot2.lastname}` 
              : flight.guest_pilot2_name,
            takeoffTime: flight.takeoff_time,
            landingTime: flight.landing_time
          });
        }
      }

      // Process guest pilot1 if exists and no regular pilot1 (student in front seat)
      if (!flight.pilot1 && flight.guest_pilot1_name) {
        const pilotKey = `guest_${flight.guest_pilot1_name}`;
        if (!pilotLogsMap.has(pilotKey)) {
          pilotLogsMap.set(pilotKey, {
            pilotId: pilotKey,
            pilotName: flight.guest_pilot1_name,
            isGuest: true,
            totalFlights: 0,
            totalFlightTime: 0,
            recentFlights: []
          });
        }
        
        const pilotLog = pilotLogsMap.get(pilotKey)!;
        pilotLog.totalFlights++;
        pilotLog.totalFlightTime += flight.flight_duration || 0;
        
        // Add to recent flights (limit to 10 most recent, but keep in chronological order)
        if (pilotLog.recentFlights.length < 10) {
          pilotLog.recentFlights.push({
            id: flight.id,
            date: flight.createdAt,
            flightDuration: flight.flight_duration,
            registration: flight.plane?.registration_id || flight.registration,
            type: flight.plane?.type || flight.type,
            launchMethod: flight.launch_method,
            instructorName: flight.pilot2 
              ? `${flight.pilot2.firstname} ${flight.pilot2.lastname}` 
              : flight.guest_pilot2_name,
            takeoffTime: flight.takeoff_time,
            landingTime: flight.landing_time
          });
        }
      }
    }

    // Convert map to array and sort by total flight time (most experienced first)
    const pilotLogs = Array.from(pilotLogsMap.values()).sort((a, b) => b.totalFlightTime - a.totalFlightTime);
    
    return NextResponse.json<PilotLogApiResponse>({
      success: true,
      pilotLogs
    });
  } catch (error: unknown) {
    console.error('Error retrieving pilot logs:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return NextResponse.json<PilotLogApiResponse>(
      { success: false, error: `Failed to retrieve pilot logs: ${errorMessage}` },
      { status: 500 }
    );
  }
}
