import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { broadcastToClients } from '@/lib/websocket/utils';
import { getStartOfDanishDayUTC, getEndOfDanishDayUTC } from '@/lib/time-utils';
import { JWTPayload } from '@/lib/jwt';
import { dailyInfoQuerySchema, validateQueryParams, validateRequestBody, mongoIdSchema } from '@/lib/validations/tablet-api';
import type { ApiResponse } from '@/types/tablet-api';
import { z } from 'zod';

/**
 * Daily info update request schema
 */
const dailyInfoUpdateSchema = z.object({
  trafficLeaderId: z.union([mongoIdSchema, z.null(), z.literal('')]).optional(),
  trafficLeaderId2: z.union([mongoIdSchema, z.null(), z.literal('')]).optional(),
  towPersonId: z.union([mongoIdSchema, z.null(), z.literal('')]).optional(),
  towPersonId2: z.union([mongoIdSchema, z.null(), z.literal('')]).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format').optional()
});

/**
 * API response for daily info endpoint
 */
interface DailyInfoApiResponse extends ApiResponse {
  dailyInfo?: {
    id: string
    clubId: string
    date: Date
    flightCount: number
    trafficLeaderId?: string | null
    trafficLeaderId2?: string | null
    towPersonId?: string | null
    towPersonId2?: string | null
    trafficLeader?: {
      id: string
      firstname: string
      lastname: string
      email?: string
    } | null
    trafficLeader2?: {
      id: string
      firstname: string
      lastname: string
      email?: string
    } | null
    towPerson?: {
      id: string
      firstname: string
      lastname: string
      email?: string
    } | null
    towPerson2?: {
      id: string
      firstname: string
      lastname: string
      email?: string
    } | null
  }
}

// Helper function to get or create daily info
async function getOrCreateDailyInfo(clubId: string, date = new Date()) {
  // Use the time utils to get day boundaries in UTC for Danish local day
  const startOfDay = getStartOfDanishDayUTC(date);
  const endOfDay = getEndOfDanishDayUTC(date);
  
  // Try to find existing daily info for this club and day
  let dailyInfo = await prisma.dailyInfo.findFirst({
    where: {
      clubId,
      date: {
        gte: startOfDay,
        lte: endOfDay
      }
    },
    include: {
      trafficLeader: {
        select: {
          id: true,
          firstname: true,
          lastname: true,
          email: true
        }
      },
      trafficLeader2: {
        select: {
          id: true,
          firstname: true,
          lastname: true,
          email: true
        }
      },
      towPerson: {
        select: {
          id: true,
          firstname: true,
          lastname: true,
          email: true
        }
      },
      towPerson2: {
        select: {
          id: true,
          firstname: true,
          lastname: true,
          email: true
        }
      }
    }
  });
  
  // If no daily info exists, create a new one
  if (!dailyInfo) {
    // Count flights for today
    const flightCount = await prisma.flightLogbook.count({
      where: {
        clubId,
        createdAt: {
          gte: startOfDay,
          lte: endOfDay
        },
        deleted: false
      }
    });
    
    dailyInfo = await prisma.dailyInfo.create({
      data: {
        clubId,
        flightCount,
        date: startOfDay
      },
      include: {
        trafficLeader: {
          select: {
            id: true,
            firstname: true,
            lastname: true,
            email: true
          }
        },
        trafficLeader2: {
          select: {
            id: true,
            firstname: true,
            lastname: true,
            email: true
          }
        },
        towPerson: {
          select: {
            id: true,
            firstname: true,
            lastname: true,
            email: true
          }
        },
        towPerson2: {
          select: {
            id: true,
            firstname: true,
            lastname: true,
            email: true
          }
        }
      }
    });
    
    // Broadcast creation of new daily info
    broadcastToClients({
      type: 'daily_info_update',
      event: 'daily_info_created',
      data: dailyInfo,
      message: 'New daily info created'
    });
  }
  
  return dailyInfo;
}

// GET handler to retrieve daily info
export async function GET(request: NextRequest): Promise<NextResponse<DailyInfoApiResponse>> {
  try {
    const { searchParams } = new URL(request.url);
    const dateParam = searchParams.get('date');

    const jwtPayloadString = request.headers.get('x-jwt-payload');
    if (!jwtPayloadString) {
      return NextResponse.json<DailyInfoApiResponse>({ success: false, error: 'Authentication token not found.' }, { status: 401 });
    }
    const jwtPayload: JWTPayload = JSON.parse(jwtPayloadString);
    const clubId = jwtPayload.clubId || jwtPayload.id;

    if (!clubId) {
      return NextResponse.json<DailyInfoApiResponse>({ success: false, error: 'Club ID not found in authentication token.' }, { status: 401 });
    }
    
    // Parse date if provided, otherwise use today
    const date = dateParam ? new Date(dateParam) : new Date();
    
    // If date is invalid, return an error
    if (isNaN(date.getTime())) {
      return NextResponse.json<DailyInfoApiResponse>(
        { success: false, error: 'Invalid date format. Use YYYY-MM-DD.' },
        { status: 400 }
      );
    }
    
    const dailyInfo = await getOrCreateDailyInfo(clubId, date);
    
    return NextResponse.json<DailyInfoApiResponse>({
      success: true,
      dailyInfo
    });
  } catch (error: any) {
    console.error('Error retrieving daily info:', error);
    
    return NextResponse.json<DailyInfoApiResponse>(
      { success: false, error: 'Failed to retrieve daily info: ' + error.message },
      { status: 500 }
    );
  }
}

// POST handler to update daily info
export async function POST(request: NextRequest): Promise<NextResponse<DailyInfoApiResponse>> {
  try {
    // Parse and validate request body
    const body = await request.json();
    
    // Validate request body with Zod
    const validation = validateRequestBody(dailyInfoUpdateSchema, body);
    if (!validation.success) {
      return NextResponse.json<DailyInfoApiResponse>(
        { 
          success: false, 
          error: validation.error,
          ...(validation.details && { details: validation.details.join(', ') })
        },
        { status: 400 }
      );
    }

    const data = validation.data;
    
    const jwtPayloadString = request.headers.get('x-jwt-payload');
    if (!jwtPayloadString) {
      return NextResponse.json<DailyInfoApiResponse>({ success: false, error: 'Authentication token not found.' }, { status: 401 });
    }
    const jwtPayload: JWTPayload = JSON.parse(jwtPayloadString);
    const clubId = jwtPayload.clubId || jwtPayload.id;

    if (!clubId) {
      return NextResponse.json<DailyInfoApiResponse>({ success: false, error: 'Club ID not found in authentication token.' }, { status: 401 });
    }
    
    // Parse date if provided, otherwise use today
    const date = data.date ? new Date(data.date) : new Date();
    
    // If date is invalid, return an error
    if (isNaN(date.getTime())) {
      return NextResponse.json<DailyInfoApiResponse>(
        { success: false, error: 'Invalid date format.' },
        { status: 400 }
      );
    }
    
    // Get the start of the day for the provided date
    const startOfDay = getStartOfDanishDayUTC(date);
    
    // Get or create daily info
    let dailyInfo = await getOrCreateDailyInfo(clubId, date);
    
    // Prepare update data
    const updateData: any = {
      date: startOfDay
    };
    
    // Handle trafficLeaderId with shifting logic
    if (data.trafficLeaderId !== undefined) {
      if (data.trafficLeaderId === null || data.trafficLeaderId === "") {
        updateData.trafficLeaderId = null;
      } else {
        // If there's already a traffic leader and we're setting a new one (different from current)
        if (dailyInfo.trafficLeaderId && dailyInfo.trafficLeaderId !== data.trafficLeaderId) {
          // Move current traffic leader to trafficLeaderId2
          updateData.trafficLeaderId2 = dailyInfo.trafficLeaderId;
        }
        updateData.trafficLeaderId = data.trafficLeaderId;
      }
    }
    
    // Handle trafficLeaderId2 (direct assignment)
    if (data.trafficLeaderId2 !== undefined) {
      if (data.trafficLeaderId2 === null || data.trafficLeaderId2 === "") {
        updateData.trafficLeaderId2 = null;
      } else {
        updateData.trafficLeaderId2 = data.trafficLeaderId2;
      }
    }
    
    // Handle towPersonId with shifting logic
    if (data.towPersonId !== undefined) {
      if (data.towPersonId === null || data.towPersonId === "") {
        updateData.towPersonId = null;
      } else {
        // If there's already a tow person and we're setting a new one (different from current)
        if (dailyInfo.towPersonId && dailyInfo.towPersonId !== data.towPersonId) {
          // Move current tow person to towPersonId2
          updateData.towPersonId2 = dailyInfo.towPersonId;
        }
        updateData.towPersonId = data.towPersonId;
      }
    }
    
    // Handle towPersonId2 (direct assignment)
    if (data.towPersonId2 !== undefined) {
      if (data.towPersonId2 === null || data.towPersonId2 === "") {
        updateData.towPersonId2 = null;
      } else {
        updateData.towPersonId2 = data.towPersonId2;
      }
    }
    
    // Update the flight count
    const flightCount = await prisma.flightLogbook.count({
      where: {
        clubId,
        createdAt: {
          gte: startOfDay,
          lte: getEndOfDanishDayUTC(date)
        },
        deleted: false
      }
    });
    
    updateData.flightCount = flightCount;
    
    // Update or create daily info
    const updatedDailyInfo = await prisma.dailyInfo.update({
      where: {
        id: dailyInfo.id
      },
      data: updateData,
      include: {
        trafficLeader: {
          select: {
            id: true,
            firstname: true,
            lastname: true,
            email: true
          }
        },
        trafficLeader2: {
          select: {
            id: true,
            firstname: true,
            lastname: true,
            email: true
          }
        },
        towPerson: {
          select: {
            id: true,
            firstname: true,
            lastname: true,
            email: true
          }
        },
        towPerson2: {
          select: {
            id: true,
            firstname: true,
            lastname: true,
            email: true
          }
        }
      }
    });
    
    // Broadcast update of daily info
    broadcastToClients({
      type: 'daily_info_update',
      event: 'daily_info_updated',
      data: updatedDailyInfo,
      message: 'Daily info updated'
    });
    
    return NextResponse.json<DailyInfoApiResponse>({
      success: true,
      dailyInfo: updatedDailyInfo
    });
  } catch (error: any) {
    console.error('Error updating daily info:', error);
    
    // Better error handling based on the error type
    if (error.code === 'P2025') {
      return NextResponse.json<DailyInfoApiResponse>(
        { success: false, error: 'Referenced entity not found' },
        { status: 404 }
      );
    } else if (error.code === 'P2003') {
      return NextResponse.json<DailyInfoApiResponse>(
        { success: false, error: 'Invalid reference (pilot or club ID not found)' },
        { status: 400 }
      );
    }
    
    return NextResponse.json<DailyInfoApiResponse>(
      { success: false, error: 'Failed to update daily info: ' + error.message },
      { status: 500 }
    );
  }
}
