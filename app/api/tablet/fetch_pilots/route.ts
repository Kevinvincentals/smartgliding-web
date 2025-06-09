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
 * Returns a list sorted by recent activity, then alphabetically
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

    // Calculate date threshold for recent activity
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

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

    // Optimize: fetch all data in parallel when activity sorting is needed
    const [clubPilots, recentPilotIds] = await Promise.all([
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
      // Only get recent pilot IDs for activity sorting (optimized query)
      queryParams.sortBy === 'activity' 
        ? prisma.flightLogbook.findMany({
            where: {
              clubId: clubId,
              deleted: false,
              OR: [
                { pilot1Id: { not: null } },
                { pilot2Id: { not: null } }
              ],
              createdAt: {
                gte: thirtyDaysAgo
              }
            },
            select: {
              pilot1Id: true,
              pilot2Id: true,
              createdAt: true
            },
            orderBy: {
              createdAt: 'desc'
            },
            take: 100 // Increase to ensure we get enough unique pilots
          }).then(flights => {
            // Extract unique pilot IDs from recent flights
            const recentIds = new Set<string>();
            for (const flight of flights) {
              if (flight.pilot1Id) recentIds.add(flight.pilot1Id);
              if (flight.pilot2Id) recentIds.add(flight.pilot2Id);
              if (recentIds.size >= 10) break; // Limit to first 10 unique pilots
            }
            return recentIds;
          })
        : Promise.resolve(new Set<string>())
    ]);

    // Transform club pilots to standard format
    const allClubPilots: Pilot[] = clubPilots.map(cp => ({
      id: cp.pilot.id,
      name: `${cp.pilot.firstname} ${cp.pilot.lastname}`,
      firstName: cp.pilot.firstname,
      lastName: cp.pilot.lastname,
      email: cp.pilot.email || undefined
    }));

    let combinedPilots: Pilot[];

    if (queryParams.sortBy === 'name') {
      // Sort all pilots alphabetically
      combinedPilots = allClubPilots.sort((a, b) => a.name.localeCompare(b.name));
    } else {
      // Sort pilots by activity: recent active pilots first, then alphabetically
      combinedPilots = allClubPilots.sort((a, b) => {
        const aIsRecent = recentPilotIds.has(String(a.id));
        const bIsRecent = recentPilotIds.has(String(b.id));
        
        // If both are recent or both are not recent, sort alphabetically
        if (aIsRecent === bIsRecent) {
          return a.name.localeCompare(b.name);
        }
        
        // Recent pilots come first
        return aIsRecent ? -1 : 1;
      });
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