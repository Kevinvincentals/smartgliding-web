import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { localTimeStringToUTC } from '@/lib/time-utils';
import { calculateFlightStatistics } from '@/lib/flight-stats';
import { updateFlightRequestSchema, validateRequestBody } from '@/lib/validations/tablet-api';
import type { ApiResponse } from '@/types/tablet-api';

/**
 * Historical flight update response
 */
interface UpdateHistoricalFlightResponse extends ApiResponse {
  flight?: Record<string, unknown>
  message?: string
}

/**
 * Updates an existing flight record for historical data management
 * Does not trigger WebSocket broadcasts - for historical data management only
 */
export async function POST(request: NextRequest): Promise<NextResponse<UpdateHistoricalFlightResponse>> {
  try {
    // Parse and validate request body
    const body = await request.json();

    // Validate that date is provided for historical context
    const { date, ...flightData } = body;
    if (!date) {
      return NextResponse.json<UpdateHistoricalFlightResponse>(
        { 
          success: false, 
          error: 'Date parameter is required for historical flight editing (format: YYYY-MM-DD)'
        },
        { status: 400 }
      )
    }

    // Validate date format
    const targetDate = new Date(date);
    if (isNaN(targetDate.getTime())) {
      return NextResponse.json<UpdateHistoricalFlightResponse>(
        { 
          success: false, 
          error: 'Invalid date format. Use YYYY-MM-DD'
        }, 
        { status: 400 }
      );
    }
    
    // Validate request body with Zod (excluding the date field)
    const validation = validateRequestBody(updateFlightRequestSchema, flightData);
    if (!validation.success) {
      return NextResponse.json<UpdateHistoricalFlightResponse>(
        { 
          success: false, 
          error: validation.error,
          ...(validation.details && { details: validation.details.join(', ') })
        },
        { status: 400 }
      );
    }

    const data = validation.data;
    
    // Destructure validated properties
    const {
      id,
      originalId,
      pilot,
      coPilot,
      startTime,
      endTime,
      status,
      isSchoolFlight,
      startField,
      landingField,
      launchMethod,
      distance
    } = data;

    // Get the flight ID - prefer originalId if available (MongoDB ObjectId)
    const flightId = String(originalId || id);

    // Check if the flight exists in the database
    const existingFlight = await prisma.flightLogbook.findUnique({
      where: { id: flightId }
    });

    if (!existingFlight) {
      return NextResponse.json<UpdateHistoricalFlightResponse>(
        { success: false, error: 'Flight not found' },
        { status: 404 }
      );
    }

    // For historical flights, convert time strings to Date objects using the target date
    const parseHistoricalTimeString = (timeStr: string): Date => {
      const [hours, minutes] = timeStr.split(':').map(Number);
      const historicalDate = new Date(targetDate);
      historicalDate.setUTCHours(hours, minutes, 0, 0);
      return historicalDate;
    };

    // Convert time strings to Date objects if they exist
    const takeoffTime = startTime ? parseHistoricalTimeString(startTime) : null;
    const landingTime = endTime ? parseHistoricalTimeString(endTime) : null;

    // Map frontend status to database values if provided
    let flightStatus = undefined; // undefined means don't update the field
    if (status) {
      if (status === 'in_flight') flightStatus = 'INFLIGHT';
      else if (status === 'completed') flightStatus = 'COMPLETED';
      else if (status === 'pending') flightStatus = 'PENDING';
      else if (status === 'deleted') flightStatus = 'PENDING'; // No "deleted" status, use PENDING
    }

    // Log the input data for debugging purposes
    console.log('Received historical edit flight data:', JSON.stringify({
      id, originalId, pilot, coPilot, startTime, endTime, status, isSchoolFlight, launchMethod, date
    }, null, 2));

    // Prepare update data with explicit pilot field handling
    const updateData: any = {
      // Only set school flight if it's explicitly provided
      is_school_flight: isSchoolFlight !== undefined ? isSchoolFlight : existingFlight.is_school_flight,
      // Set launch method if provided
      launch_method: launchMethod || existingFlight.launch_method,
      // Keep historical date context in updatedAt
      updatedAt: new Date() // Use current time for updatedAt to track when the historical edit was made
    };

    // Add status to updateData if it was provided
    if (flightStatus) {
      updateData.status = flightStatus;
    }

    // Determine status from times if status not explicitly provided
    if (!flightStatus) {
      if (takeoffTime && !landingTime) {
        updateData.status = 'INFLIGHT';
      } else if (takeoffTime && landingTime) {
        updateData.status = 'LANDED'; // Flight has both takeoff and landing times
      }
    }

    // Check for explicit null values first - handle each pilot field separately
    if (pilot === null) {
      console.log('PRIORITY: Explicitly removing pilot1 from historical flight - setting pilot1Id to null');
      updateData.pilot1Id = null;
    } 

    if (coPilot === null) {
      console.log('PRIORITY: Explicitly removing pilot2 from historical flight - setting pilot2Id to null');
      updateData.pilot2Id = null;
    }

    // Add airfield information
    if (startField) {
      updateData.takeoff_airfield = startField;
    }
    
    if (landingField) {
      updateData.landing_airfield = landingField;
    } else {
      updateData.landing_airfield = null;
    }

    // Only include distance if it's a number
    if (typeof distance === 'number') {
      updateData.flight_distance = distance;
    }

    // Handle pilot data - different strategies depending on the pilot ID format
    if (pilot) {
      // If ID looks like a MongoDB ObjectId, use it directly
      if (typeof pilot.id === 'string' && /^[0-9a-fA-F]{24}$/.test(pilot.id)) {
        updateData.pilot1Id = pilot.id;
        // Clear any guest pilot name when setting a real pilot
        updateData.guest_pilot1_name = null;
        console.log(`Setting pilot1Id to MongoDB ID: ${pilot.id}`);
      } 
      // If we have a name but not a valid MongoDB ID, store as guest pilot
      else if (pilot.name) {
        // Store as guest pilot directly in the flight record
        updateData.pilot1Id = null; // Clear any pilot ID
        updateData.guest_pilot1_name = pilot.name; // Store guest name
        console.log(`Setting guest pilot name to: ${pilot.name}`);
      }
    } else if (pilot === null) {
      // Explicitly setting pilot to null - clear both pilot ID and guest name
      updateData.pilot1Id = null;
      updateData.guest_pilot1_name = null;
      console.log('Explicitly removing pilot1 from historical flight - setting pilot1Id and guest_pilot1_name to null');
    }

    // Similar handling for co-pilot
    if (coPilot) {
      if (typeof coPilot.id === 'string' && /^[0-9a-fA-F]{24}$/.test(coPilot.id)) {
        updateData.pilot2Id = coPilot.id;
        // Clear any guest co-pilot name when setting a real co-pilot
        updateData.guest_pilot2_name = null;
        console.log(`Setting pilot2Id to MongoDB ID: ${coPilot.id}`);
      } 
      else if (coPilot.name) {
        // Store as guest co-pilot directly in the flight record
        updateData.pilot2Id = null; // Clear any co-pilot ID
        updateData.guest_pilot2_name = coPilot.name; // Store guest name
        console.log(`Setting guest co-pilot name to: ${coPilot.name}`);
      }
    } else if (coPilot === null) {
      // Explicitly setting co-pilot to null - clear both pilot ID and guest name
      updateData.pilot2Id = null;
      updateData.guest_pilot2_name = null;
      console.log('Explicitly removing pilot2 from historical flight - setting pilot2Id and guest_pilot2_name to null');
    }

    // Check if we need to increment the plane's start count
    // If adding a takeoff time when there wasn't one before
    let shouldIncrementPlaneStarts = false;
    if (takeoffTime && !existingFlight.takeoff_time && existingFlight.planeId) {
      shouldIncrementPlaneStarts = true;
    }

    // Check if we need to decrement the plane's start count
    // If removing a takeoff time when there was one before
    let shouldDecrementPlaneStarts = false;
    if (!takeoffTime && existingFlight.takeoff_time && existingFlight.planeId) {
      shouldDecrementPlaneStarts = true;
    }

    // Add times if they exist
    if (takeoffTime) {
      console.log(`Setting historical takeoff time to: ${takeoffTime.toISOString()}`);
      updateData.takeoff_time = takeoffTime;
    }

    // Track if flight is landing for statistics calculation
    const isAddingLandingTime = landingTime && !existingFlight.landing_time;

    // Handle landing time setting or clearing
    if (landingTime) {
      console.log(`Setting historical landing time to: ${landingTime.toISOString()}`);
      updateData.landing_time = landingTime;
    } else if (landingTime === null || endTime === null || status === 'in_flight') {
      // If landing time is explicitly set to null, or end time is null, or status is in_flight
      // then explicitly clear the landing time and landing field
      console.log('Explicitly removing historical landing time');
      updateData.landing_time = null;
      
      // Also clear the landing airfield if the status changes to in_flight or landing time is removed
      if (!landingField || landingField === null || status === 'in_flight') {
        console.log('Also clearing landing airfield since historical flight is not completed');
        updateData.landing_airfield = null;
      }
      
      // Also clear the flight duration if we're removing the landing time
      updateData.flight_duration = null;
    }

    // Calculate flight duration if both times are available
    if (takeoffTime && landingTime) {
      const durationMs = landingTime.getTime() - takeoffTime.getTime();
      const durationMinutes = Math.floor(durationMs / (1000 * 60));
      if (durationMinutes > 0) {
        updateData.flight_duration = durationMinutes;
        console.log(`Calculated historical flight duration: ${durationMinutes} minutes`);
      }
    }

    // After all processing for pilots
    console.log('Final historical update data:', JSON.stringify(updateData, null, 2));

    // Update the flight record - only select necessary fields for the response
    const updatedFlight = await prisma.flightLogbook.update({
      where: {
        id: flightId,
      },
      data: updateData,
      select: {
        id: true,
        flarm_id: true,
        registration: true,
        type: true,
        competition_number: true,
        pilot1Id: true,
        guest_pilot1_name: true,
        pilot2Id: true,
        guest_pilot2_name: true,
        is_school_flight: true,
        launch_method: true,
        planeId: true,
        clubId: true,
        takeoff_time: true,
        landing_time: true,
        flight_duration: true,
        flight_distance: true,
        max_altitude: true,
        max_speed: true,
        takeoff_airfield: true,
        landing_airfield: true,
        notes: true,
        status: true,
        deleted: true,
        createdAt: true,
        updatedAt: true,
        pilot1: {
          select: {
            id: true,
            firstname: true,
            lastname: true,
          }
        },
        pilot2: {
          select: {
            id: true,
            firstname: true,
            lastname: true,
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

    // If adding a landing time, calculate flight statistics from FLARM data
    if (isAddingLandingTime) {
      try {
        console.log(`Calculating flight statistics for historical landing flight ID: ${flightId}`);
        const statistics = await calculateFlightStatistics(flightId);
        
        if (statistics.calculationSuccessful) {
          // Use $runCommandRaw to bypass TypeScript since schema migration might not be run yet
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
          
          console.log(`Updated historical flight ${flightId} with statistics:`, statistics);
          
          // Add the statistics to the updated flight object for response
          (updatedFlight as any).flight_distance = statistics.distance;
          (updatedFlight as any).max_altitude = statistics.maxAltitude;
          (updatedFlight as any).max_speed = statistics.maxSpeed;
        } else {
          console.log(`No valid FLARM data found for historical flight ${flightId} or calculation failed`);
        }
      } catch (error) {
        console.error('Error calculating or updating historical flight statistics:', error);
        // Continue with the response even if statistics calculation fails
      }
    }

    // Handle counter increments/decrements for planes and pilots
    if (shouldIncrementPlaneStarts && existingFlight.planeId) {
      try {
        // Use MongoDB-specific command to increment the starts field
        await prisma.$runCommandRaw({
          update: "planes",
          updates: [
            {
              q: { _id: { $oid: existingFlight.planeId } },
              u: { $inc: { starts: 1 } },
            },
          ],
        });
        console.log(`Incremented start count for plane ID: ${existingFlight.planeId} (historical)`);
      } catch (error) {
        console.error('Error incrementing plane starts for historical flight:', error);
      }
    } else if (shouldDecrementPlaneStarts && existingFlight.planeId) {
      try {
        // Use MongoDB-specific command to decrement the starts field
        await prisma.$runCommandRaw({
          update: "planes",
          updates: [
            {
              q: { _id: { $oid: existingFlight.planeId } },
              u: { $inc: { starts: -1 } },
            },
          ],
        });
      } catch (error) {
        console.error('Error decrementing plane starts for historical flight:', error);
      }
    }

    // Handle pilot flight starts counters
    if (shouldIncrementPlaneStarts) {
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
          console.log(`Incremented flight starts for pilot1 ID: ${existingFlight.pilot1Id} (historical)`);
        } catch (error) {
          console.error('Error incrementing pilot1 flight starts for historical flight:', error);
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
          console.log(`Incremented flight starts for pilot2 ID: ${existingFlight.pilot2Id} (historical)`);
        } catch (error) {
          console.error('Error incrementing pilot2 flight starts for historical flight:', error);
        }
      }
    } else if (shouldDecrementPlaneStarts) {
      // For pilot1 - decrement when removing takeoff time
      if (existingFlight.pilot1Id) {
        try {
          await prisma.$runCommandRaw({
            update: "pilots",
            updates: [
              {
                q: { _id: { $oid: existingFlight.pilot1Id } },
                u: { $inc: { flight_starts: -1 } },
              },
            ],
          });
        } catch (error) {
          console.error('Error decrementing pilot1 flight starts for historical flight:', error);
        }
      }

      // For pilot2 (co-pilot) - decrement when removing takeoff time
      if (existingFlight.pilot2Id) {
        try {
          await prisma.$runCommandRaw({
            update: "pilots",
            updates: [
              {
                q: { _id: { $oid: existingFlight.pilot2Id } },
                u: { $inc: { flight_starts: -1 } },
              },
            ],
          });
        } catch (error) {
          console.error('Error decrementing pilot2 flight starts for historical flight:', error);
        }
      }
    }

    // Prepare response with properly formatted pilot data
    const responseData = {
      ...updatedFlight,
      // Format pilot objects for the frontend
      pilot: updatedFlight.pilot1 
        ? { 
            id: updatedFlight.pilot1.id, 
            name: `${updatedFlight.pilot1.firstname} ${updatedFlight.pilot1.lastname}` 
          }
        : (updatedFlight.guest_pilot1_name 
            ? { id: 'guest', name: updatedFlight.guest_pilot1_name }
            : null),
      
      coPilot: updatedFlight.pilot2
        ? { 
            id: updatedFlight.pilot2.id, 
            name: `${updatedFlight.pilot2.firstname} ${updatedFlight.pilot2.lastname}` 
          }
        : (updatedFlight.guest_pilot2_name 
            ? { id: 'guest', name: updatedFlight.guest_pilot2_name }
            : null)
    };

    // Note: No WebSocket broadcast for historical flights
    console.log(`Historical flight updated for date ${date}:`, flightId);

    return NextResponse.json<UpdateHistoricalFlightResponse>({
      success: true,
      message: 'Historical flight updated successfully',
      flight: responseData
    });
  } catch (error: any) {
    console.error('Error updating historical flight:', error);
    
    // Better error handling based on the error type
    if (error.code === 'P2025') {
      return NextResponse.json<UpdateHistoricalFlightResponse>(
        { success: false, error: 'Historical flight not found' },
        { status: 404 }
      );
    } else if (error.code === 'P2003') {
      return NextResponse.json<UpdateHistoricalFlightResponse>(
        { success: false, error: 'Invalid reference (pilot or club ID not found)' },
        { status: 400 }
      );
    }
    
    return NextResponse.json<UpdateHistoricalFlightResponse>(
      { success: false, error: 'Failed to update historical flight' },
      { status: 500 }
    );
  }
}

