import { NextRequest, NextResponse } from 'next/server';
import { broadcastToClients } from '@/lib/websocket/utils';
import { prisma } from '@/lib/prisma';
import { deleteFlightRequestSchema, validateRequestBody } from '@/lib/validations/tablet-api';
import type { ApiResponse } from '@/types/tablet-api';

/**
 * Flight deletion response
 */
interface DeleteFlightResponse extends ApiResponse {
  flight?: Record<string, unknown>
}

export async function POST(request: NextRequest): Promise<NextResponse<DeleteFlightResponse>> {
  try {
    // Parse and validate request body
    const body = await request.json();
    
    // Validate request body with Zod
    const validation = validateRequestBody(deleteFlightRequestSchema, body);
    if (!validation.success) {
      return NextResponse.json<DeleteFlightResponse>(
        { 
          success: false, 
          error: validation.error,
          ...(validation.details && { details: validation.details.join(', ') })
        },
        { status: 400 }
      );
    }

    const { flightId, originalId } = validation.data;

    // Get the flight ID - prefer originalId if available (MongoDB ObjectId)
    const dbFlightId = String(originalId || flightId);

    // Check if the flight exists in the database
    const existingFlight = await prisma.flightLogbook.findUnique({
      where: { id: dbFlightId }
    });

    if (!existingFlight) {
      return NextResponse.json<DeleteFlightResponse>(
        { success: false, error: 'Flight not found' },
        { status: 404 }
      );
    }


    // Check if we need to decrement the plane's start count
    // Only decrement if the flight has a takeoff time and is associated with a plane
    const shouldDecrementPlaneStarts = existingFlight.takeoff_time && existingFlight.planeId;
    
    // Update the flight record to mark it as deleted
    const updateData: any = {
      // Since we need to handle linting issues with typescript not recognizing the new field
      // we use a type assertion to bypass the check
      deleted: true
    };

    // Update the flight record
    const updatedFlight = await prisma.flightLogbook.update({
      where: {
        id: dbFlightId,
      },
      data: updateData,
      include: {
        pilot1: {
          select: {
            id: true,
            firstname: true,
            lastname: true,
            email: true
          }
        },
        pilot2: {
          select: {
            id: true,
            firstname: true,
            lastname: true,
            email: true
          }
        },
        plane: {
          select: {
            id: true,
            registration_id: true,
            type: true,
            is_twoseater: true,
            flarm_id: true
          }
        }
      }
    });

    // Decrement the plane's start count if needed
    if (shouldDecrementPlaneStarts) {
      try {
        // Use MongoDB-specific command to decrement the starts field
        await prisma.$runCommandRaw({
          update: "planes",
          updates: [
            {
              q: { _id: { $oid: existingFlight.planeId } },
              u: [
                { 
                  $set: { 
                    starts: { 
                      $cond: [
                        { $lte: ["$starts", 1] }, // If starts <= 1 or null
                        0,                        // Set to 0
                        { $subtract: ["$starts", 1] } // Otherwise decrement by 1
                      ]
                    }
                  }
                }
              ],
            },
          ],
        });
      } catch (error) {
        console.error('Error decrementing plane starts:', error);
      }
    }

    // Decrement pilot flight starts based on flight type
    if (shouldDecrementPlaneStarts) {
      // Always decrement pilot1 (1. Pilot)
      if (existingFlight.pilot1Id) {
        try {
          await prisma.$runCommandRaw({
            update: "pilots",
            updates: [
              {
                q: { _id: { $oid: existingFlight.pilot1Id } },
                u: [
                  { 
                    $set: { 
                      flight_starts: { 
                        $cond: [
                          { $lte: ["$flight_starts", 1] }, // If flight_starts <= 1 or null
                          0,                               // Set to 0
                          { $subtract: ["$flight_starts", 1] } // Otherwise decrement by 1
                        ]
                      }
                    }
                  }
                ],
              },
            ],
          });
        } catch (error) {
          console.error('Error decrementing pilot1 flight starts:', error);
        }
      }

      // Only decrement pilot2 (2. Pilot) if it's a school flight
      if (existingFlight.pilot2Id && existingFlight.is_school_flight) {
        try {
          await prisma.$runCommandRaw({
            update: "pilots",
            updates: [
              {
                q: { _id: { $oid: existingFlight.pilot2Id } },
                u: [
                  { 
                    $set: { 
                      flight_starts: { 
                        $cond: [
                          { $lte: ["$flight_starts", 1] }, // If flight_starts <= 1 or null
                          0,                               // Set to 0
                          { $subtract: ["$flight_starts", 1] } // Otherwise decrement by 1
                        ]
                      }
                    }
                  }
                ],
              },
            ],
          });
        } catch (error) {
          console.error('Error decrementing pilot2 flight starts:', error);
        }
      } else if (existingFlight.pilot2Id && !existingFlight.is_school_flight) {
      }
    }

    // Get plane registration for message
    let registration = 'Ukendt fly';
    
    if (updatedFlight.registration) {
      registration = updatedFlight.registration;
    } else {
      // Use a type assertion to access the plane property safely
      const result = updatedFlight as any;
      if (result.plane && result.plane.registration_id) {
        registration = result.plane.registration_id;
      }
    }
    
    // Create a modified version of the updatedFlight with explicit status information
    const flightWithStatus = {
      ...updatedFlight,
      status: 'deleted' // Ensure client sees this as deleted regardless of DB status
    };
    
    // Determine the target airfield for the broadcast
    const targetAirfield = (updatedFlight as any).takeoff_airfield || (updatedFlight as any).landing_airfield || existingFlight.takeoff_airfield || "unknown";
    if (targetAirfield === "unknown") {
      console.warn(`DeleteFlight: Could not determine target airfield for flight ID ${dbFlightId}. Broadcasting might be too broad or fail to infer.`);
    }

    // Broadcast the flight deletion over WebSocket with enhanced details
    broadcastToClients({
      type: 'flight_update',
      event: 'flight_deleted',
      data: flightWithStatus,
      isNewFlight: false,
      message: `${registration} flyvning er slettet`
    }, targetAirfield); // Pass the targetAirfield

    return NextResponse.json<DeleteFlightResponse>({
      success: true,
      flight: flightWithStatus
    });
  } catch (error: any) {
    console.error('Error marking flight as deleted:', error);
    
    // Better error handling based on the error type
    if (error.code === 'P2025') {
      return NextResponse.json<DeleteFlightResponse>(
        { success: false, error: 'Flight not found' },
        { status: 404 }
      );
    }
    
    return NextResponse.json<DeleteFlightResponse>(
      { success: false, error: 'Failed to delete flight: ' + error.message },
      { status: 500 }
    );
  }
}
