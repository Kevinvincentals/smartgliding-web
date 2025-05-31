import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import type { JWTPayload, ApiResponse } from '@/types/tablet-api';

/**
 * Request body for updating flight notes
 */
interface UpdateFlightNotesRequest {
  flightId: string;
  originalId?: string;
  notes: string;
}

/**
 * Response for update flight notes endpoint
 */
interface UpdateFlightNotesResponse extends ApiResponse<{ success: boolean }> {
  flightId?: string;
}

/**
 * Updates the notes for a specific flight
 */
export async function POST(request: NextRequest): Promise<NextResponse<UpdateFlightNotesResponse>> {
  try {
    // Extract JWT payload from headers (set by middleware)
    const jwtPayloadString = request.headers.get('x-jwt-payload');
    if (!jwtPayloadString) {
      return NextResponse.json<UpdateFlightNotesResponse>(
        { 
          success: false, 
          error: 'Authentication token not found.' 
        }, 
        { status: 401 }
      );
    }
    
    const jwtPayload: JWTPayload = JSON.parse(jwtPayloadString);
    const clubId = jwtPayload.clubId || jwtPayload.id;

    if (!clubId) {
      return NextResponse.json<UpdateFlightNotesResponse>(
        { 
          success: false, 
          error: 'Club ID not found in authentication token.' 
        }, 
        { status: 401 }
      );
    }

    // Parse request body
    let body: UpdateFlightNotesRequest;
    try {
      body = await request.json();
    } catch (error) {
      return NextResponse.json<UpdateFlightNotesResponse>(
        { 
          success: false, 
          error: 'Invalid JSON in request body.' 
        }, 
        { status: 400 }
      );
    }

    const { flightId, originalId, notes } = body;

    // Get the actual flight ID - prefer originalId if available (MongoDB ObjectId)
    const actualFlightId = String(originalId || flightId);

    // Validate required fields
    if (!actualFlightId) {
      return NextResponse.json<UpdateFlightNotesResponse>(
        { 
          success: false, 
          error: 'Flight ID is required.' 
        }, 
        { status: 400 }
      );
    }

    // Validate that notes is a string (can be empty)
    if (typeof notes !== 'string') {
      return NextResponse.json<UpdateFlightNotesResponse>(
        { 
          success: false, 
          error: 'Notes must be a string.' 
        }, 
        { status: 400 }
      );
    }

    // Check if flight exists and belongs to the club
    const existingFlight = await prisma.flightLogbook.findFirst({
      where: {
        id: actualFlightId,
        clubId: clubId
      }
    });

    if (!existingFlight) {
      return NextResponse.json<UpdateFlightNotesResponse>(
        { 
          success: false, 
          error: 'Flight not found or you do not have permission to edit this flight.' 
        }, 
        { status: 404 }
      );
    }

    // Update the flight notes
    const updatedFlight = await prisma.flightLogbook.update({
      where: {
        id: actualFlightId
      },
      data: {
        notes: notes.trim() || null, // Store null for empty notes
        updatedAt: new Date()
      }
    });

    return NextResponse.json<UpdateFlightNotesResponse>({
      success: true,
      data: { success: true },
      flightId: updatedFlight.id
    });

  } catch (error) {
    console.error('Error updating flight notes:', error);
    return NextResponse.json<UpdateFlightNotesResponse>(
      { 
        success: false, 
        error: 'Failed to update flight notes.' 
      },
      { status: 500 }
    );
  }
} 