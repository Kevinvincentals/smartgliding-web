import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { singlePlaneQuerySchema, validateQueryParams } from '@/lib/validations/tablet-api';
import type { ApiResponse } from '@/types/tablet-api';

/**
 * Single plane fetch response
 */
interface PlaneApiResponse extends ApiResponse {
  plane?: {
    id: string
    registration: string
    type: string
    isDoubleSeater: boolean
    hasFlarm: boolean
    flarmId?: string
    competitionId?: string
    notes?: string
  }
}

export async function GET(request: NextRequest): Promise<NextResponse<PlaneApiResponse>> {
  try {
    const url = new URL(request.url);
    
    // Validate query parameters with Zod
    const validation = validateQueryParams(singlePlaneQuerySchema, url.searchParams);
    if (!validation.success) {
      return NextResponse.json<PlaneApiResponse>(
        { 
          success: false, 
          error: validation.error,
          ...(validation.details && { details: validation.details.join(', ') })
        }, 
        { status: 400 }
      );
    }

    const queryParams = validation.data;
    
    console.log(`Fetching plane with params:`, queryParams);
    
    // Build where clause based on provided parameters
    let whereClause: any = {};
    
    if (queryParams.planeId) {
      whereClause.id = queryParams.planeId;
    } else if (queryParams.registration) {
      whereClause.registration_id = queryParams.registration;
    }
    
    // Find the plane in the database
    const plane = await prisma.plane.findUnique({
      where: whereClause,
      select: {
        id: true,
        registration_id: true,
        type: true,
        is_twoseater: true,
        flarm_id: true,
        competition_id: true,
        notes: true
      }
    });
    
    if (!plane) {
      return NextResponse.json<PlaneApiResponse>({
        success: false,
        error: 'Plane not found'
      }, { status: 404 });
    }
    
    // Return the plane details in a format that matches the client-side Aircraft type
    return NextResponse.json<PlaneApiResponse>({
      success: true,
      plane: {
        id: plane.id,
        registration: plane.registration_id,
        type: plane.type,
        isDoubleSeater: plane.is_twoseater,
        hasFlarm: !!plane.flarm_id,
        flarmId: plane.flarm_id || undefined,
        competitionId: plane.competition_id || undefined,
        notes: plane.notes || undefined
      }
    });
    
  } catch (error: unknown) {
    console.error('Error fetching plane:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return NextResponse.json<PlaneApiResponse>({
      success: false,
      error: `Failed to fetch plane: ${errorMessage}`
    }, { status: 500 });
  }
} 