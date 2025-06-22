import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import type { JWTPayload, ApiResponse } from '@/types/tablet-api';
import type { Pilot } from '@/types/flight';
import { pilotQuerySchema, validateQueryParams } from '@/lib/validations/tablet-api';

/**
 * API response for pilots endpoint
 */
interface PilotsApiResponse extends ApiResponse<Pilot[]> {
  pilots: Pilot[];
}

/**
 * Fetches pilots for a club, prioritizing recently active pilots
 * Returns top 12 pilots sorted by most recent flight date, then rest alphabetically
 */
export async function GET(request: NextRequest): Promise<NextResponse<PilotsApiResponse>> {
  try {
    const url = new URL(request.url);
    
    // Validate query parameters with Zod
    const validation = validateQueryParams(pilotQuerySchema, url.searchParams);
    if (!validation.success) {
      return NextResponse.json<PilotsApiResponse>(
        { 
          success: false, 
          error: validation.error,
          ...(validation.details && { details: validation.details.join(', ') }),
          pilots: []
        }, 
        { status: 400 }
      );
    }

    const queryParams = validation.data;

    // Extract JWT payload from headers (set by middleware)
    const jwtPayloadString = request.headers.get('x-jwt-payload');
    if (!jwtPayloadString) {
      return NextResponse.json<PilotsApiResponse>(
        { success: false, error: 'Authentication token not found.', pilots: [] },
        { status: 401 }
      );
    }

    const jwtPayload: JWTPayload = JSON.parse(jwtPayloadString);
    const clubId = jwtPayload.clubId || jwtPayload.id;

    if (!clubId) {
      return NextResponse.json<PilotsApiResponse>(
        { success: false, error: 'Club ID not found in authentication token.', pilots: [] },
        { status: 401 }
      );
    }

    // Build search filter for club pilots
    let whereClause: any = { clubId: clubId };
    
    // Add search filter if provided
    if (queryParams.search) {
      whereClause.pilot = {
        OR: [
          { firstname: { contains: queryParams.search, mode: 'insensitive' } },
          { lastname: { contains: queryParams.search, mode: 'insensitive' } }
        ]
      };
    }

    // Fetch all club pilots and their most recent flight dates in parallel
    const [clubPilots, recentFlightActivity] = await Promise.all([
      // Fetch all club pilots
      prisma.clubPilot.findMany({
        where: whereClause,
        include: {
          pilot: {
            select: {
              id: true,
              firstname: true,
              lastname: true,
              email: true
            }
          }
        }
      }),
      // Get the most recent flight for each pilot (only if not searching)
      !queryParams.search 
        ? prisma.flightLogbook.findMany({
            where: {
              clubId: clubId,
              deleted: false,
              OR: [
                { pilot1Id: { not: null } },
                { pilot2Id: { not: null } }
              ]
            },
            select: {
              pilot1Id: true,
              pilot2Id: true,
              takeoff_time: true,
              createdAt: true
            },
            orderBy: [
              { takeoff_time: 'desc' },
              { createdAt: 'desc' }
            ],
            take: 500 // Get enough flights to find recent activity for all active pilots
          }).then(flights => {
            // Build a map of pilot ID to their most recent flight date
            const pilotLastFlight = new Map<string, Date>();
            
            for (const flight of flights) {
              // Use takeoff_time if available, otherwise createdAt
              const flightDate = flight.takeoff_time || flight.createdAt;
              
              // Check pilot1
              if (flight.pilot1Id && !pilotLastFlight.has(flight.pilot1Id)) {
                pilotLastFlight.set(flight.pilot1Id, flightDate);
              }
              
              // Check pilot2
              if (flight.pilot2Id && !pilotLastFlight.has(flight.pilot2Id)) {
                pilotLastFlight.set(flight.pilot2Id, flightDate);
              }
            }
            
            return pilotLastFlight;
          })
        : Promise.resolve(new Map<string, Date>())
    ]);

    // Transform club pilots to standard format with last flight date
    const allClubPilots: (Pilot & { lastFlightDate?: Date })[] = clubPilots.map(cp => ({
      id: cp.pilot.id,
      name: `${cp.pilot.firstname} ${cp.pilot.lastname}`,
      firstName: cp.pilot.firstname,
      lastName: cp.pilot.lastname,
      email: cp.pilot.email || undefined,
      lastFlightDate: recentFlightActivity.get(cp.pilot.id)
    }));

    let combinedPilots: Pilot[];

    if (queryParams.sortBy === 'name' || queryParams.search) {
      // Sort all pilots alphabetically (always do this when searching)
      combinedPilots = allClubPilots
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(p => ({ ...p, lastFlightDate: undefined })); // Remove the helper field
    } else {
      // Sort by recent activity: top 12 pilots by last flight date, rest alphabetical
      
      // Separate pilots who have flown from those who haven't
      const pilotsWithFlights = allClubPilots.filter(p => p.lastFlightDate);
      const pilotsWithoutFlights = allClubPilots.filter(p => !p.lastFlightDate);
      
      // Sort pilots with flights by most recent first
      const sortedRecentPilots = pilotsWithFlights.sort((a, b) => {
        if (!a.lastFlightDate || !b.lastFlightDate) return 0;
        return b.lastFlightDate.getTime() - a.lastFlightDate.getTime();
      });
      
      // Take the top 12 most recent pilots
      const topRecentPilots = sortedRecentPilots.slice(0, 12);
      const remainingRecentPilots = sortedRecentPilots.slice(12);
      
      // Sort the remaining pilots (both recent overflow and never flown) alphabetically
      const remainingPilots = [...remainingRecentPilots, ...pilotsWithoutFlights]
        .sort((a, b) => a.name.localeCompare(b.name));
      
      // Log the sorting results for debugging
      
      // Combine: top 12 recent pilots first, then alphabetical rest
      combinedPilots = [...topRecentPilots, ...remainingPilots]
        .map(p => ({ ...p, lastFlightDate: undefined })); // Remove the helper field
    }

    return NextResponse.json<PilotsApiResponse>({
      success: true,
      pilots: combinedPilots
    });
  } catch (error: unknown) {
    console.error('Error fetching pilots:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return NextResponse.json<PilotsApiResponse>(
      { 
        success: false, 
        error: `Failed to fetch pilots: ${errorMessage}`,
        pilots: []
      },
      { status: 500 }
    );
  }
} 