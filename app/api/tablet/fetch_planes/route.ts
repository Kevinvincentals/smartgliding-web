import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import type { JWTPayload, ApiResponse } from '@/types/tablet-api';
import type { Aircraft } from '@/types/flight';
import { planeQuerySchema, validateQueryParams } from '@/lib/validations/tablet-api';

/**
 * Plane data from database with processing flags
 */
interface PlaneWithMetadata {
  id: string;
  registration_id: string;
  type: string;
  is_twoseater: boolean;
  flarm_id: string | null;
  competition_id: string | null;
  createdAt: Date | null;
  isLikelyGuest: boolean;
  isRecentEnough: boolean;
}

/**
 * API response for planes endpoint
 */
interface PlanesApiResponse extends ApiResponse<Aircraft[]> {
  planes: Aircraft[];
}

/**
 * Fetches aircraft for a club, prioritizing frequently used planes
 * Filters out old guest planes to keep the list manageable
 */
export async function GET(request: NextRequest): Promise<NextResponse<PlanesApiResponse>> {
  try {
    const url = new URL(request.url);
    
    // Validate query parameters with Zod
    const validation = validateQueryParams(planeQuerySchema, url.searchParams);
    if (!validation.success) {
      return NextResponse.json<PlanesApiResponse>(
        { 
          success: false, 
          error: validation.error,
          ...(validation.details && { details: validation.details.join(', ') }),
          planes: []
        }, 
        { status: 400 }
      );
    }

    const queryParams = validation.data;

    // Extract JWT payload from headers (set by middleware)
    const jwtPayloadString = request.headers.get('x-jwt-payload');
    if (!jwtPayloadString) {
      return NextResponse.json<PlanesApiResponse>(
        { success: false, error: 'Authentication token not found.', planes: [] },
        { status: 401 }
      );
    }

    const jwtPayload: JWTPayload = JSON.parse(jwtPayloadString);
    const clubId = jwtPayload.clubId || jwtPayload.id;

    if (!clubId) {
      return NextResponse.json<PlanesApiResponse>(
        { success: false, error: 'Club ID not found in authentication token.', planes: [] },
        { status: 401 }
      );
    }

    // Calculate date thresholds for filtering
    const today = new Date();
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(today.getDate() - 30);
    
    const threeDaysAgo = new Date(today);
    threeDaysAgo.setDate(today.getDate() - 3);

    // Build where clause for planes query
    let planeWhereClause: any = { clubId: clubId };
    
    // Add search filter if provided
    if (queryParams.search) {
      planeWhereClause.OR = [
        { registration_id: { contains: queryParams.search, mode: 'insensitive' } },
        { type: { contains: queryParams.search, mode: 'insensitive' } },
        { competition_id: { contains: queryParams.search, mode: 'insensitive' } }
      ];
    }
    
    // Add FLARM filter if specified
    if (queryParams.hasFlarm !== undefined) {
      if (queryParams.hasFlarm) {
        planeWhereClause.flarm_id = { not: null };
      } else {
        planeWhereClause.flarm_id = null;
      }
    }

    // Optimize: fetch planes and recent activity data in parallel
    const [allClubPlanesDb, recentlyUsedPlaneIds] = await Promise.all([
      // Fetch all club aircraft
      prisma.plane.findMany({
        where: planeWhereClause,
        orderBy: queryParams.sortBy === 'registration' 
          ? { registration_id: 'asc' } 
          : queryParams.sortBy === 'type'
          ? { type: 'asc' }
          : { registration_id: 'asc' }, // default
        select: {
          id: true,
          registration_id: true,
          type: true,
          is_twoseater: true,
          flarm_id: true,
          competition_id: true,
          createdAt: true,
          is_guest: true,
        },
      }),
      // Get recent flights to determine recently used aircraft (for activity sort)
      queryParams.sortBy === 'activity' 
        ? prisma.flightLogbook.findMany({
            where: {
              clubId: clubId,
              deleted: false,
              planeId: { not: null },
              createdAt: {
                gte: thirtyDaysAgo,
              },
            },
            orderBy: {
              createdAt: 'desc',
            },
            select: {
              planeId: true,
            },
            take: 100, // Get more flights to ensure we have enough data
          }).then(flights => {
            // Get unique plane IDs in order of most recent usage
            const seenPlaneIds = new Set<string>();
            const recentIds: string[] = [];
            for (const flight of flights) {
              if (flight.planeId && !seenPlaneIds.has(flight.planeId)) {
                seenPlaneIds.add(flight.planeId);
                recentIds.push(flight.planeId);
                
                // Stop after we have 10 unique planes
                if (recentIds.length >= 10) {
                  break;
                }
              }
            }
            return recentIds;
          })
        : Promise.resolve([])
    ]);
    
    // Process planes with guest detection heuristics
    const processedPlanes: PlaneWithMetadata[] = allClubPlanesDb.map(plane => {
      // Primary: Use the explicit is_guest field from database
      // Secondary: Heuristics for planes that might be from OGN registry or legacy data
      const isLikelyGuest = 
        plane.is_guest || // Trust the database field first
        plane.type?.includes('OGN Registry') || 
        plane.registration_id?.startsWith('GUEST-');
        // Removed the createdAt heuristic - recently added planes aren't necessarily guests
      
      // Keep recent guest planes but filter out old ones unless includeGuests is true
      const isRecentEnough = queryParams.includeGuests || 
                            !isLikelyGuest || 
                            (plane.createdAt && new Date(plane.createdAt) >= threeDaysAgo);
      
      return {
        ...plane,
        isLikelyGuest,
        isRecentEnough
      };
    });
    
    // Filter planes based on query parameters
    let filteredPlanes = processedPlanes.filter(plane => {
      // Include inactive filter
      if (!queryParams.includeInactive && plane.isLikelyGuest && !plane.isRecentEnough) {
        return false;
      }
      
      return plane.isRecentEnough;
    });
    
    // Sort planes based on sortBy parameter
    if (queryParams.sortBy === 'activity') {
      // Sort by recent usage: top 10 most recently used planes first, then alphabetically
      filteredPlanes = filteredPlanes.sort((a, b) => {
        const aIndex = recentlyUsedPlaneIds.indexOf(a.id);
        const bIndex = recentlyUsedPlaneIds.indexOf(b.id);
        
        if (aIndex >= 0 && bIndex >= 0) {
          return aIndex - bIndex; // Both recently used, sort by recency order
        } else if (aIndex >= 0) {
          return -1; // a is recently used, comes first
        } else if (bIndex >= 0) {
          return 1; // b is recently used, comes first
        }
        
        // Neither recently used, sort alphabetically
        return a.registration_id.localeCompare(b.registration_id);
      });
    }
    // For 'registration' and 'type' sorting, the database query already handles ordering
    
    // Transform to client-side Aircraft interface
    const transformedPlanes: Aircraft[] = filteredPlanes.map(plane => ({
      id: plane.id,
      registration: plane.registration_id,
      type: plane.type,
      isDoubleSeater: plane.is_twoseater,
      hasFlarm: Boolean(plane.flarm_id),
      flarmId: plane.flarm_id || undefined,
      competitionId: plane.competition_id || undefined,
      isGuest: plane.isLikelyGuest,
      createdAt: plane.createdAt ? plane.createdAt.toISOString() : undefined,
    }));

    return NextResponse.json<PlanesApiResponse>({
      success: true,
      planes: transformedPlanes,
    });
  } catch (error: unknown) {
    console.error('Error fetching planes:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return NextResponse.json<PlanesApiResponse>(
      { 
        success: false, 
        error: `Failed to fetch planes: ${errorMessage}`,
        planes: []
      },
      { status: 500 }
    );
  }
} 