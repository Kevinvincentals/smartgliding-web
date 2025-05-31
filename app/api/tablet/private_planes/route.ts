import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { JWTPayload } from '@/lib/jwt';
import { getStartOfTimezoneDayUTC } from '@/lib/time-utils';
import type { ApiResponse } from '@/types/tablet-api';
import { z } from 'zod';

/**
 * Schema for creating/updating private plane assignment
 */
const privatePlaneRequestSchema = z.object({
  planeId: z.string().min(1, 'Plane ID is required'),
  pilot1Id: z.string().optional(),
  pilot2Id: z.string().optional(),
  guest_pilot1_name: z.string().optional(),
  guest_pilot2_name: z.string().optional(),
  isSchoolFlight: z.boolean().default(false),
  launchMethod: z.string().default('S'),
  startField: z.string().min(1, 'Start field is required'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format').optional()
});

/**
 * Private plane assignment response
 */
interface PrivatePlaneApiResponse extends ApiResponse {
  privatePlanes?: Array<{
    id: string;
    planeId: string;
    plane: {
      id: string;
      registration_id: string;
      type: string;
      competition_id: string | null;
      is_twoseater: boolean;
    } | null;
    pilot1?: {
      id: string;
      firstname: string;
      lastname: string;
    } | null;
    pilot2?: {
      id: string;
      firstname: string;
      lastname: string;
    } | null;
    guest_pilot1_name: string | null;
    guest_pilot2_name: string | null;
    isSchoolFlight: boolean;
    launchMethod: string;
    startField: string;
    date: Date;
  }>;
  privatePlane?: {
    id: string;
    planeId: string;
  };
}

/**
 * GET - Fetch private plane assignments for the day
 */
export async function GET(request: NextRequest): Promise<NextResponse<PrivatePlaneApiResponse>> {
  try {
    // Get JWT payload from headers (set by middleware)
    const jwtPayloadString = request.headers.get('x-jwt-payload');
    if (!jwtPayloadString) {
      return NextResponse.json<PrivatePlaneApiResponse>(
        { success: false, error: 'Authentication token not found in request headers.' },
        { status: 401 }
      );
    }

    const jwtPayload: JWTPayload = JSON.parse(jwtPayloadString);
    const clubId = jwtPayload.clubId || jwtPayload.id;

    if (!clubId) {
      return NextResponse.json<PrivatePlaneApiResponse>(
        { success: false, error: 'Club ID not found in authentication token.' },
        { status: 401 }
      );
    }

    // Get date from query parameters or use today
    const { searchParams } = new URL(request.url);
    const dateParam = searchParams.get('date');
    const targetDate = dateParam ? new Date(dateParam) : new Date();
    const startOfDay = getStartOfTimezoneDayUTC(targetDate);

    // Fetch private plane assignments for the day
    const privatePlanes = await prisma.dailyPrivatePlanes.findMany({
      where: {
        clubId,
        date: startOfDay
      },
      include: {
        plane: {
          select: {
            id: true,
            registration_id: true,
            type: true,
            competition_id: true,
            is_twoseater: true
          }
        },
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
      }
    });

    // Filter out any private planes where the plane has been deleted
    const validPrivatePlanes = privatePlanes.filter((pp: any) => pp.plane !== null && pp.planeId !== null);

    // Transform the data to ensure proper typing
    const formattedPrivatePlanes = validPrivatePlanes.map((pp: any) => ({
      id: pp.id,
      planeId: pp.planeId as string, // Safe since we filtered out nulls
      plane: pp.plane,
      pilot1: pp.pilot1,
      pilot2: pp.pilot2,
      guest_pilot1_name: pp.guest_pilot1_name,
      guest_pilot2_name: pp.guest_pilot2_name,
      isSchoolFlight: pp.isSchoolFlight,
      launchMethod: pp.launchMethod,
      startField: pp.startField,
      date: pp.date
    }));

    return NextResponse.json<PrivatePlaneApiResponse>({
      success: true,
      privatePlanes: formattedPrivatePlanes
    });

  } catch (error: unknown) {
    console.error('Error fetching private planes:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return NextResponse.json<PrivatePlaneApiResponse>(
      { success: false, error: `Failed to fetch private planes: ${errorMessage}` },
      { status: 500 }
    );
  }
}

/**
 * POST - Create or update private plane assignment
 */
export async function POST(request: NextRequest): Promise<NextResponse<PrivatePlaneApiResponse>> {
  try {
    // Parse request body
    const body = await request.json();
    
    // Validate request body
    const validation = privatePlaneRequestSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json<PrivatePlaneApiResponse>(
        { 
          success: false, 
          error: 'Invalid request data',
          details: validation.error.errors.map(e => e.message).join(', ')
        },
        { status: 400 }
      );
    }

    const data = validation.data;

    // Get JWT payload from headers (set by middleware)
    const jwtPayloadString = request.headers.get('x-jwt-payload');
    if (!jwtPayloadString) {
      return NextResponse.json<PrivatePlaneApiResponse>(
        { success: false, error: 'Authentication token not found in request headers.' },
        { status: 401 }
      );
    }

    const jwtPayload: JWTPayload = JSON.parse(jwtPayloadString);
    const clubId = jwtPayload.clubId || jwtPayload.id;

    if (!clubId) {
      return NextResponse.json<PrivatePlaneApiResponse>(
        { success: false, error: 'Club ID not found in authentication token.' },
        { status: 401 }
      );
    }

    // Get target date
    const targetDate = data.date ? new Date(data.date) : new Date();
    const startOfDay = getStartOfTimezoneDayUTC(targetDate);

    // Verify plane belongs to the club
    const plane = await prisma.plane.findFirst({
      where: {
        id: data.planeId,
        clubId
      }
    });

    if (!plane) {
      return NextResponse.json<PrivatePlaneApiResponse>(
        { success: false, error: 'Plane not found or does not belong to your club.' },
        { status: 404 }
      );
    }

    // Verify pilots exist if provided
    if (data.pilot1Id) {
      const pilot1 = await prisma.pilot.findUnique({
        where: { id: data.pilot1Id }
      });
      if (!pilot1) {
        return NextResponse.json<PrivatePlaneApiResponse>(
          { success: false, error: 'Pilot 1 not found.' },
          { status: 404 }
        );
      }
    }

    if (data.pilot2Id) {
      const pilot2 = await prisma.pilot.findUnique({
        where: { id: data.pilot2Id }
      });
      if (!pilot2) {
        return NextResponse.json<PrivatePlaneApiResponse>(
          { success: false, error: 'Pilot 2 not found.' },
          { status: 404 }
        );
      }
    }

    // Create or update private plane assignment
    const privateePlane = await prisma.dailyPrivatePlanes.upsert({
      where: {
        planeId_clubId_date: {
          planeId: data.planeId,
          clubId,
          date: startOfDay
        }
      },
      update: {
        pilot1Id: data.pilot1Id || null,
        pilot2Id: data.pilot2Id || null,
        guest_pilot1_name: data.guest_pilot1_name || null,
        guest_pilot2_name: data.guest_pilot2_name || null,
        isSchoolFlight: data.isSchoolFlight,
        launchMethod: data.launchMethod,
        startField: data.startField,
        updatedAt: new Date()
      },
      create: {
        planeId: data.planeId,
        clubId,
        date: startOfDay,
        pilot1Id: data.pilot1Id || null,
        pilot2Id: data.pilot2Id || null,
        guest_pilot1_name: data.guest_pilot1_name || null,
        guest_pilot2_name: data.guest_pilot2_name || null,
        isSchoolFlight: data.isSchoolFlight,
        launchMethod: data.launchMethod,
        startField: data.startField
      }
    });

    return NextResponse.json<PrivatePlaneApiResponse>({
      success: true,
      privatePlane: {
        id: privateePlane.id,
        planeId: privateePlane.planeId || data.planeId
      }
    });

  } catch (error: unknown) {
    console.error('Error managing private plane:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return NextResponse.json<PrivatePlaneApiResponse>(
      { success: false, error: `Failed to manage private plane: ${errorMessage}` },
      { status: 500 }
    );
  }
}

/**
 * DELETE - Remove private plane assignment
 */
export async function DELETE(request: NextRequest): Promise<NextResponse<PrivatePlaneApiResponse>> {
  try {
    // Get JWT payload from headers (set by middleware)
    const jwtPayloadString = request.headers.get('x-jwt-payload');
    if (!jwtPayloadString) {
      return NextResponse.json<PrivatePlaneApiResponse>(
        { success: false, error: 'Authentication token not found in request headers.' },
        { status: 401 }
      );
    }

    const jwtPayload: JWTPayload = JSON.parse(jwtPayloadString);
    const clubId = jwtPayload.clubId || jwtPayload.id;

    if (!clubId) {
      return NextResponse.json<PrivatePlaneApiResponse>(
        { success: false, error: 'Club ID not found in authentication token.' },
        { status: 401 }
      );
    }

    // Get plane ID and date from query parameters
    const { searchParams } = new URL(request.url);
    const planeId = searchParams.get('planeId');
    const dateParam = searchParams.get('date');
    
    if (!planeId) {
      return NextResponse.json<PrivatePlaneApiResponse>(
        { success: false, error: 'Plane ID is required.' },
        { status: 400 }
      );
    }

    const targetDate = dateParam ? new Date(dateParam) : new Date();
    const startOfDay = getStartOfTimezoneDayUTC(targetDate);

    // Delete the private plane assignment
    await prisma.dailyPrivatePlanes.deleteMany({
      where: {
        planeId,
        clubId,
        date: startOfDay
      }
    });

    return NextResponse.json<PrivatePlaneApiResponse>({
      success: true
    });

  } catch (error: unknown) {
    console.error('Error removing private plane:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return NextResponse.json<PrivatePlaneApiResponse>(
      { success: false, error: `Failed to remove private plane: ${errorMessage}` },
      { status: 500 }
    );
  }
} 