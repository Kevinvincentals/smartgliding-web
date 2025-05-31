import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { JWTPayload } from '@/lib/jwt';
import type { ApiResponse } from '@/types/tablet-api';

interface InstructorFlight {
  id: string
  date: Date
  flightDuration: number | null // in minutes
  registration: string | null
  type: string | null
  studentName: string | null // pilot1 name (student)
  takeoffTime: Date | null
  landingTime: Date | null
  launchMethod: string | null
  isSchoolFlight: boolean
}

interface InstructorLog {
  instructorId: string
  instructorName: string
  isGuest: boolean
  totalFlights: number
  totalFlightTime: number // in minutes
  recentFlights: InstructorFlight[]
}

interface InstructorLogApiResponse extends ApiResponse {
  instructorLogs?: InstructorLog[]
}

export async function GET(request: NextRequest): Promise<NextResponse<InstructorLogApiResponse>> {
  try {
    const { searchParams } = new URL(request.url);
    const dateParam = searchParams.get('date');
    const yearParam = searchParams.get('year');
    const allParam = searchParams.get('all');

    const jwtPayloadString = request.headers.get('x-jwt-payload');
    if (!jwtPayloadString) {
      return NextResponse.json<InstructorLogApiResponse>(
        { success: false, error: 'Authentication token not found.' }, 
        { status: 401 }
      );
    }
    
    const jwtPayload: JWTPayload = JSON.parse(jwtPayloadString);
    const clubId = jwtPayload.clubId || jwtPayload.id;

    console.log('Club ID:', clubId);
    console.log('Looking for ALL instructor flights in club');

    if (!clubId) {
      return NextResponse.json<InstructorLogApiResponse>(
        { success: false, error: 'Club ID not found in authentication token.' }, 
        { status: 401 }
      );
    }

    // Build where clause - find ALL flights in the club where there's an instructor (pilot2)
    let whereClause: any = {
      clubId: clubId,
      pilot2Id: { not: null }, // Must have an instructor (pilot2)
      deleted: false
    };

    // Apply date filtering
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

    console.log('Query where clause:', JSON.stringify(whereClause, null, 2));
    
    const instructorFlights = await prisma.flightLogbook.findMany({
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

    console.log('Found flights:', instructorFlights.length);

    // Group flights by instructor (pilot2)
    const instructorLogsMap = new Map<string, InstructorLog>();

    for (const flight of instructorFlights) {
      // Process pilot2 (instructor)
      if (flight.pilot2) {
        const instructorKey = `instructor_${flight.pilot2.id}`;
        if (!instructorLogsMap.has(instructorKey)) {
          instructorLogsMap.set(instructorKey, {
            instructorId: flight.pilot2.id,
            instructorName: `${flight.pilot2.firstname} ${flight.pilot2.lastname}`,
            isGuest: false,
            totalFlights: 0,
            totalFlightTime: 0,
            recentFlights: []
          });
        }
        
        const instructorLog = instructorLogsMap.get(instructorKey)!;
        instructorLog.totalFlights++;
        instructorLog.totalFlightTime += flight.flight_duration || 0;
        
        // Add all flights (no limit)
        instructorLog.recentFlights.push({
          id: flight.id,
          date: flight.createdAt,
          flightDuration: flight.flight_duration,
          registration: flight.plane?.registration_id || flight.registration,
          type: flight.plane?.type || flight.type,
          launchMethod: flight.launch_method,
          studentName: flight.pilot1 
            ? `${flight.pilot1.firstname} ${flight.pilot1.lastname}` 
            : flight.guest_pilot1_name,
          takeoffTime: flight.takeoff_time,
          landingTime: flight.landing_time,
          isSchoolFlight: flight.is_school_flight || false
        });
      }

      // Process guest pilot2 if exists and no regular pilot2 (guest instructor)
      if (!flight.pilot2 && flight.guest_pilot2_name) {
        const instructorKey = `guest_${flight.guest_pilot2_name}`;
        if (!instructorLogsMap.has(instructorKey)) {
          instructorLogsMap.set(instructorKey, {
            instructorId: instructorKey,
            instructorName: flight.guest_pilot2_name,
            isGuest: true,
            totalFlights: 0,
            totalFlightTime: 0,
            recentFlights: []
          });
        }
        
        const instructorLog = instructorLogsMap.get(instructorKey)!;
        instructorLog.totalFlights++;
        instructorLog.totalFlightTime += flight.flight_duration || 0;
        
        // Add all flights (no limit)
        instructorLog.recentFlights.push({
          id: flight.id,
          date: flight.createdAt,
          flightDuration: flight.flight_duration,
          registration: flight.plane?.registration_id || flight.registration,
          type: flight.plane?.type || flight.type,
          launchMethod: flight.launch_method,
          studentName: flight.pilot1 
            ? `${flight.pilot1.firstname} ${flight.pilot1.lastname}` 
            : flight.guest_pilot1_name,
          takeoffTime: flight.takeoff_time,
          landingTime: flight.landing_time,
          isSchoolFlight: flight.is_school_flight || false
        });
      }
    }

    // Convert map to array and sort by total flight time (most experienced instructors first)
    const instructorLogs = Array.from(instructorLogsMap.values()).sort((a, b) => b.totalFlightTime - a.totalFlightTime);
    
    return NextResponse.json<InstructorLogApiResponse>({
      success: true,
      instructorLogs
    });
  } catch (error: unknown) {
    console.error('Error fetching instructor log:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return NextResponse.json<InstructorLogApiResponse>(
      { success: false, error: `Failed to fetch instructor log: ${errorMessage}` },
      { status: 500 }
    );
  }
} 