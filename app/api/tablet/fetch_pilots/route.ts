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

    // Get recent flights to identify active pilots (unless sortBy is 'name')
    let recentPilots: Pilot[] = [];
    const recentPilotIds = new Set<string>();

    if (queryParams.sortBy === 'activity') {
      const recentFlights = await prisma.flightLogbook.findMany({
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
        orderBy: {
          createdAt: 'desc'
        },
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
          }
        },
        take: 50
      });

      // Extract unique recently active pilots
      for (const flight of recentFlights) {
        // Add pilot1 if not already included
        if (flight.pilot1 && !recentPilotIds.has(flight.pilot1.id)) {
          recentPilotIds.add(flight.pilot1.id);
          recentPilots.push({
            id: flight.pilot1.id,
            name: `${flight.pilot1.firstname} ${flight.pilot1.lastname}`,
            firstName: flight.pilot1.firstname,
            lastName: flight.pilot1.lastname
          });
        }
        
        // Add pilot2 if not already included
        if (flight.pilot2 && !recentPilotIds.has(flight.pilot2.id)) {
          recentPilotIds.add(flight.pilot2.id);
          recentPilots.push({
            id: flight.pilot2.id,
            name: `${flight.pilot2.firstname} ${flight.pilot2.lastname}`,
            firstName: flight.pilot2.firstname,
            lastName: flight.pilot2.lastname
          });
        }
        
        // Limit to 10 most recent active pilots
        if (recentPilots.length >= 10) {
          break;
        }
      }
    }

    // Fetch all club pilots
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

    const clubPilots = await prisma.clubPilot.findMany({
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
    });

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
      // Filter out pilots already in recent list
      const regularPilots = allClubPilots.filter(
        pilot => !recentPilotIds.has(String(pilot.id))
      );

      // Sort regular pilots alphabetically by name
      regularPilots.sort((a, b) => a.name.localeCompare(b.name));

      // Combine lists with recent pilots first (for activity sort)
      combinedPilots = [...recentPilots, ...regularPilots];
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