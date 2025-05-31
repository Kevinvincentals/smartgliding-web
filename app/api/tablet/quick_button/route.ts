import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { broadcastToClients } from '@/lib/websocket/utils';
import { localTimeStringToUTC } from '@/lib/time-utils';
import { calculateFlightStatistics } from '@/lib/flight-stats';
import { quickButtonActionSchema, validateRequestBody } from '@/lib/validations/tablet-api';
import type { ApiResponse } from '@/types/tablet-api';

/**
 * Quick button action response
 */
interface QuickButtonResponse extends ApiResponse {
  flight?: Record<string, unknown>
}

// Add a parseTimeString function for consistency if we need it in the future
function parseTimeString(timeString: string): Date | null {
  // Use the utility function for consistent time conversion
  const result = localTimeStringToUTC(timeString);
  
  if (result) {
    console.log(`Quick Button API: Converting time from frontend: ${timeString} → ${result.toISOString()} (with explicit Danish time offset)`);
  }
  
  return result;
}

export async function POST(request: NextRequest): Promise<NextResponse<QuickButtonResponse>> {
  try {
    // Parse and validate request body
    const body = await request.json();
    
    // Validate request body with Zod
    const validation = validateRequestBody(quickButtonActionSchema, body);
    if (!validation.success) {
      return NextResponse.json<QuickButtonResponse>(
        { 
          success: false, 
          error: validation.error,
          ...(validation.details && { details: validation.details.join(', ') })
        },
        { status: 400 }
      );
    }

    const { flightId, action } = validation.data;

    console.log(`Quick button action: ${action} for flight ID: ${flightId}`);

    // Check if the flight exists in the database
    const existingFlight = await prisma.flightLogbook.findUnique({
      where: { id: flightId }
    });

    if (!existingFlight) {
      return NextResponse.json<QuickButtonResponse>(
        { success: false, error: 'Flight not found' },
        { status: 404 }
      );
    }

    // Get current time
    const now = new Date();
    
    // Prepare update data based on action
    const updateData: any = {};
    
    if (action === 'start') {
      updateData.takeoff_time = now;
      updateData.status = 'INFLIGHT'; // Update status to INFLIGHT
      
      // Clear landing time if it exists (unusual case but possible)
      if (existingFlight.landing_time) {
        updateData.landing_time = null;
        updateData.landing_airfield = null;
        updateData.flight_duration = null;
      }
    } else if (action === 'end') {
      updateData.landing_time = now;
      updateData.status = 'LANDED'; // Update status to LANDED
      
      // Set landing field to takeoff field if not set
      if (!existingFlight.landing_airfield) {
        updateData.landing_airfield = existingFlight.takeoff_airfield;
      }
      
      // Calculate flight duration if takeoff time exists
      if (existingFlight.takeoff_time) {
        const durationMs = now.getTime() - existingFlight.takeoff_time.getTime();
        const durationMinutes = Math.floor(durationMs / (1000 * 60));
        if (durationMinutes > 0) {
          updateData.flight_duration = durationMinutes;
          console.log(`Calculated flight duration: ${durationMinutes} minutes`);
        }
      }
    } else if (action === 'delete') {
      updateData.deleted = true;
    }

    console.log('Update data:', JSON.stringify(updateData, null, 2));

    // Update the flight record
    const updatedFlight = await prisma.flightLogbook.update({
      where: {
        id: flightId,
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

    // If this is a landing action, calculate flight statistics from FLARM data
    if (action === 'end') {
      try {
        console.log(`Calculating flight statistics for flight ID: ${flightId}`);
        const statistics = await calculateFlightStatistics(flightId);
        
        if (statistics.calculationSuccessful) {
          try {
            // Update the flight with the calculated statistics
            // Use $runCommandRaw to bypass TypeScript since schema migration hasn't been run yet
            await prisma.$runCommandRaw({
              update: "flight_logbook",
              updates: [
                {
                  q: { _id: { $oid: flightId } },
                  u: { 
                    $set: { 
                      flight_distance: statistics.distance,
                      max_altitude: statistics.maxAltitude,
                      max_speed: statistics.maxSpeed
                    } 
                  },
                },
              ],
            });
            
            console.log(`Updated flight ${flightId} with statistics:`, statistics);
            
            // Add the statistics to the updated flight object for response
            updatedFlight.flight_distance = statistics.distance;
            
            // Use type assertion for the additional properties
            (updatedFlight as any).max_altitude = statistics.maxAltitude;
            (updatedFlight as any).max_speed = statistics.maxSpeed;
          } catch (statsError) {
            console.error('Error updating flight statistics:', statsError);
          }
        } else {
          console.log(`No valid FLARM data found for flight ${flightId} or calculation failed`);
        }
      } catch (error) {
        console.error('Error calculating or updating flight statistics:', error);
        // Continue with the response even if statistics calculation fails
      }
    }

    // Increment the plane's start count if this is a takeoff action
    if (action === 'start' && existingFlight.planeId) {
      try {
        // Since this is MongoDB, use direct document update through Prisma client
        // This bypasses the type system but works correctly with MongoDB
        await prisma.$runCommandRaw({
          update: "planes",
          updates: [
            {
              q: { _id: { $oid: existingFlight.planeId } },
              u: { $inc: { starts: 1 } },
            },
          ],
        });
        console.log(`Incremented start count for plane ID: ${existingFlight.planeId}`);
      } catch (error) {
        console.error('Error incrementing plane starts:', error);
      }
    }

    // Increment pilot flight starts for both pilots if this is a takeoff action
    if (action === 'start') {
      // For pilot1
      if (existingFlight.pilot1Id) {
        try {
          await prisma.$runCommandRaw({
            update: "pilots",
            updates: [
              {
                q: { _id: { $oid: existingFlight.pilot1Id } },
                u: { $inc: { flight_starts: 1 } },
              },
            ],
          });
          console.log(`Incremented flight starts for pilot1 ID: ${existingFlight.pilot1Id}`);
        } catch (error) {
          console.error('Error incrementing pilot1 flight starts:', error);
        }
      }

      // For pilot2 (co-pilot)
      if (existingFlight.pilot2Id) {
        try {
          await prisma.$runCommandRaw({
            update: "pilots",
            updates: [
              {
                q: { _id: { $oid: existingFlight.pilot2Id } },
                u: { $inc: { flight_starts: 1 } },
              },
            ],
          });
          console.log(`Incremented flight starts for pilot2 ID: ${existingFlight.pilot2Id}`);
        } catch (error) {
          console.error('Error incrementing pilot2 flight starts:', error);
        }
      }
    }

    // Format response with appropriate status
    let status = 'pending';
    let operation = action; // Track if this was a takeoff or landing
    if (updatedFlight.takeoff_time && updatedFlight.landing_time) {
      status = 'completed';
    } else if (updatedFlight.takeoff_time && !updatedFlight.landing_time) {
      status = 'in_flight';
    } else if (!updatedFlight.takeoff_time && updatedFlight.landing_time) {
      status = 'landing_only';
    }

    // Get plane registration for message
    const registration = updatedFlight.registration || updatedFlight.plane?.registration_id || 'Ukendt fly';
    
    // Create appropriate message based on action
    let message = '';
    let eventType = '';
    if (action === 'start') {
      message = `${registration} er lettet`;
      eventType = 'flight_takeoff';
    } else if (action === 'end') {
      message = `${registration} er landet`;
      eventType = 'flight_landing';
    }
    
    // Create a data object with explicit status for the client
    const flightWithStatus = {
      ...updatedFlight,
      status // Include the client-friendly status
    };
    
    // Determine the target airfield for the broadcast
    const targetAirfield = updatedFlight.takeoff_airfield || updatedFlight.landing_airfield || existingFlight.takeoff_airfield || "unknown";
    if (targetAirfield === "unknown") {
      console.warn(`QuickButton: Could not determine target airfield for flight ID ${flightId}. Broadcasting might be too broad or fail to infer.`);
    }

    // Broadcast the flight update over WebSocket
    broadcastToClients({
      type: 'flight_update',
      event: eventType,
      data: flightWithStatus,
      isNewFlight: false,
      message
    }, targetAirfield); // Pass the targetAirfield

    return NextResponse.json<QuickButtonResponse>({
      success: true,
      flight: {
        ...flightWithStatus,
        operation // Add the operation type to help the client know what changed
      }
    });
  } catch (error: any) {
    console.error('Error updating flight:', error);
    
    // Better error handling based on the error type
    if (error.code === 'P2025') {
      return NextResponse.json<QuickButtonResponse>(
        { success: false, error: 'Flight not found' },
        { status: 404 }
      );
    } else if (error.code === 'P2003') {
      return NextResponse.json<QuickButtonResponse>(
        { success: false, error: 'Invalid reference (pilot or club ID not found)' },
        { status: 400 }
      );
    }
    
    return NextResponse.json<QuickButtonResponse>(
      { success: false, error: 'Failed to update flight: ' + error.message },
      { status: 500 }
    );
  }
} 