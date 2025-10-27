import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';
import { getGliderByFlarmId } from '@/lib/flightLogbook';
import { broadcastToClients } from '@/lib/websocket/utils';
import { calculateFlightStatistics } from '@/lib/flight-stats';
import { getStartOfTimezoneDayUTC, getCurrentTimeAsUTC } from '@/lib/time-utils';

// Define status constants for our internal use
const FLIGHT_STATUS = {
  PENDING: 'PENDING',
  INFLIGHT: 'INFLIGHT',
  LANDED: 'LANDED',
  COMPLETED: 'COMPLETED'
} as const;

// Define schema for webhook payloads
const testHookSchema = z.object({
  type: z.literal('testhook'),
  origin: z.string(),
  config: z.object({
    active: z.boolean(),
    url: z.string(),
    headers: z.record(z.string()),
    airfields: z.array(z.string()),
    triggers: z.object({
      landing: z.boolean(),
      takeoff: z.boolean(),
      udlanding: z.boolean(),
      udtakeoff: z.boolean(),
    }),
  }),
});

const flightEventSchema = z.object({
  type: z.enum(['landing', 'takeoff', 'udlanding', 'udtakeoff']),
  origin: z.string(),
  airfield: z.string(),
  id: z.string(),
});

type WebhookPayload = z.infer<typeof testHookSchema> | z.infer<typeof flightEventSchema>;

export async function POST(request: Request) {
  try {
    // Verify webhook API key
    const apiKey = request.headers.get('X-api-key') || request.headers.get('x-api-key');
    const expectedApiKey = process.env.WEBHOOK_API_KEY || 'secret';
    
    if (!apiKey || apiKey !== expectedApiKey) {
      console.warn('Webhook: Invalid or missing API key');
      return NextResponse.json({ success: false, error: 'Invalid or missing API key' }, { status: 401 });
    }

    // Parse webhook payload
    const payload = await request.json();

    // Process based on webhook type
    if (payload.type === 'testhook') {
      return handleTestHook(payload);
    } else if (['takeoff', 'landing', 'udtakeoff', 'udlanding'].includes(payload.type)) {
      // Broadcast the webhook event to WebSocket clients with basic info first
      broadcastToClients({
        type: 'webhook',
        event: payload.type,
        data: payload
      }, payload.airfield);
      
      return handleFlightEvent(payload as z.infer<typeof flightEventSchema>);
    }

    return NextResponse.json({ success: false, error: 'Unsupported webhook type' }, { status: 400 });
  } catch (error) {
    console.error('Webhook processing error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

async function handleTestHook(payload: z.infer<typeof testHookSchema>) {
  // Broadcast test hook to WebSocket clients
  broadcastToClients({
    type: 'webhook',
    event: 'testhook',
    data: payload
  });
  
  // Just acknowledge the test hook
  return NextResponse.json({
    success: true,
    message: 'Test hook received successfully',
    config: payload.config,
  });
}

// Helper function to get complete flight data for WebSocket broadcast
async function getCompleteFlightData(flightId: string) {
  try {
    // Get the complete flight data with all relations - matching fetch_flights API exactly
    const flight = await prisma.flightLogbook.findUnique({
      where: { id: flightId },
      include: {
        pilot1: {
          select: {
            id: true,
            firstname: true,
            lastname: true
            // Removed email to match API response
          }
        },
        pilot2: {
          select: {
            id: true,
            firstname: true,
            lastname: true
            // Removed email to match API response
          }
        },
        plane: {
          select: {
            id: true,
            registration_id: true,
            type: true,
            competition_id: true,
            is_twoseater: true,
            flarm_id: true
          }
        }
      }
    });

    if (!flight) return null;
    
    // Process the flight to match the fetch_flights API response format exactly
    let status = 'pending';
    
    if (flight.takeoff_time && flight.landing_time) {
      status = 'completed';
    } else if (flight.takeoff_time && !flight.landing_time) {
      status = 'in_flight';
    } else if (!flight.takeoff_time && flight.landing_time) {
      status = 'landing_only';
    }
    
    // Get flarm_id from either the flight directly or from the plane data
    const flarmId = flight.flarm_id || (flight.plane?.flarm_id || null);
    // Check if the flarmId is valid (not "none" or "unknown")
    const hasValidFlarm = flarmId && flarmId !== 'none' && flarmId !== 'unknown';
    
    // For planes not registered in our system, treat them as two-seaters
    const isDoubleSeater = flight.plane ? flight.plane.is_twoseater : true;
    
    // Return data structure that exactly matches the API response format
    return {
      id: flight.id,
      flarm_id: flarmId,
      registration: flight.registration,
      type: flight.type,
      competition_number: flight.competition_number,
      pilot1Id: flight.pilot1Id,
      guest_pilot1_name: flight.guest_pilot1_name,
      pilot2Id: flight.pilot2Id,
      guest_pilot2_name: flight.guest_pilot2_name,
      is_school_flight: flight.is_school_flight,
      launch_method: flight.launch_method,
      planeId: flight.planeId,
      clubId: flight.clubId,
      takeoff_time: flight.takeoff_time,
      landing_time: flight.landing_time,
      flight_duration: flight.flight_duration,
      takeoff_airfield: flight.takeoff_airfield,
      landing_airfield: flight.landing_airfield,
      status,
      deleted: flight.deleted,
      createdAt: flight.createdAt,
      updatedAt: flight.updatedAt,
      pilot1: flight.pilot1,
      pilot2: flight.pilot2,
      plane: flight.plane ? {
        id: flight.plane.id,
        registration_id: flight.plane.registration_id,
        type: flight.plane.type,
        competition_id: flight.plane.competition_id,
        is_twoseater: flight.plane.is_twoseater,
        flarm_id: flight.plane.flarm_id,
        has_valid_flarm: hasValidFlarm
      } : {
        id: null,
        registration_id: flight.registration || 'Unknown',
        type: flight.type || 'Unknown',
        competition_id: flight.competition_number || null,
        is_twoseater: true,
        flarm_id: flarmId,
        has_valid_flarm: hasValidFlarm
      }
    };
  } catch (error) {
    console.error("Error getting complete flight data:", error);
    return null;
  }
}

// Helper function to check for private plane assignments
async function getPrivatePlaneAssignment(planeId: string | undefined, clubId: string | undefined) {
  if (!planeId || !clubId) return null;
  
  const today = getStartOfTimezoneDayUTC(new Date());
  
  try {
    const privatePlane = await prisma.dailyPrivatePlanes.findFirst({
      where: {
        planeId,
        clubId,
        date: today
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
      }
    });
    
    return privatePlane;
  } catch (error) {
    console.error('Error checking private plane assignment:', error);
    return null;
  }
}

async function handleFlightEvent(payload: z.infer<typeof flightEventSchema>) {
  const { type, id: flarmId, airfield } = payload;
  
  // Look up plane information in our database
  const plane = await prisma.plane.findFirst({
    where: { flarm_id: flarmId },
    include: {
      club: true,
    },
  });

  // If not found in our database, look up in the glider database
  let registration = plane?.registration_id;
  let aircraftType = plane?.type;
  let competitionNumber = plane?.competition_id;
  let isTwoSeater = plane?.is_twoseater ?? true; // Default to two-seater if not registered
  
  if (!plane) {
    const gliderInfo = await getGliderByFlarmId(flarmId);
    if (gliderInfo) {
      registration = gliderInfo.registration || undefined;
      aircraftType = gliderInfo.aircraftModel || undefined;
      competitionNumber = gliderInfo.competitionNumber || undefined;
    }
  }

  // Get current time in configured timezone (properly converted to UTC)
  const now = getCurrentTimeAsUTC();

  // For takeoff events (takeoff and udtakeoff)
  if (type === 'takeoff' || type === 'udtakeoff') {
    // First: Try to find a pending flight with the same FLARM ID
    let pendingFlight = await prisma.flightLogbook.findFirst({
      where: {
        flarm_id: flarmId,
        status: FLIGHT_STATUS.PENDING,
        deleted: { not: true }
      },
      orderBy: { createdAt: 'asc' }
    });
    
    if (pendingFlight) {
      const updatedFlight = await prisma.flightLogbook.update({
        where: { id: pendingFlight.id },
        data: {
          takeoff_time: now,
          takeoff_airfield: airfield,
          status: FLIGHT_STATUS.INFLIGHT
        },
      });
      
      // Increment the plane's start count if there's a plane ID
      if (pendingFlight.planeId) {
        try {
          // Use MongoDB-specific command to increment the starts field
          await prisma.$runCommandRaw({
            update: "planes",
            updates: [
              {
                q: { _id: { $oid: pendingFlight.planeId } },
                u: { $inc: { starts: 1 } },
              },
            ],
          });
          console.log(`Incremented start count for plane ID: ${pendingFlight.planeId}`);
        } catch (error) {
          console.error('Error incrementing plane starts:', error);
        }
      }
      
      // Increment pilot flight starts based on flight type
      // Always increment pilot1 (1. Pilot)
      if (pendingFlight.pilot1Id) {
        try {
          await prisma.$runCommandRaw({
            update: "pilots",
            updates: [
              {
                q: { _id: { $oid: pendingFlight.pilot1Id } },
                u: { $inc: { flight_starts: 1 } },
              },
            ],
          });
          console.log(`Incremented flight starts for pilot1 ID: ${pendingFlight.pilot1Id}`);
        } catch (error) {
          console.error('Error incrementing pilot1 flight starts:', error);
        }
      }

      // Only increment pilot2 (2. Pilot) if it's a school flight
      if (pendingFlight.pilot2Id && pendingFlight.is_school_flight) {
        try {
          await prisma.$runCommandRaw({
            update: "pilots",
            updates: [
              {
                q: { _id: { $oid: pendingFlight.pilot2Id } },
                u: { $inc: { flight_starts: 1 } },
              },
            ],
          });
          console.log(`Incremented flight starts for pilot2 ID: ${pendingFlight.pilot2Id} (school flight)`);
        } catch (error) {
          console.error('Error incrementing pilot2 flight starts:', error);
        }
      } else if (pendingFlight.pilot2Id && !pendingFlight.is_school_flight) {
        console.log(`Skipped incrementing flight starts for pilot2 ID: ${pendingFlight.pilot2Id} (normal flight - only pilot1 gets credited)`);
      }
      
      // Get complete flight data for WebSocket broadcast
      const completeFlightData = await getCompleteFlightData(updatedFlight.id);
      
      if (completeFlightData) {
        // Broadcast the complete flight data to WebSocket clients
        broadcastToClients({
          type: 'flight_update',
          event: type,
          data: completeFlightData,
          isNewFlight: false
        }, airfield);
      }
      
      return NextResponse.json({
        success: true,
        message: 'Takeoff recorded for pending flight',
        flightLog: updatedFlight,
      });
    }
    
    // Second: Try to find a pending flight with the same registration ID
    if (!pendingFlight && registration) {
      pendingFlight = await prisma.flightLogbook.findFirst({
        where: {
          registration: registration,
          status: FLIGHT_STATUS.PENDING,
          deleted: { not: true }
        },
        orderBy: { createdAt: 'asc' }
      });
    }
    
    // Third: Try to find a pending flight with the same plane ID
    if (!pendingFlight && plane?.id) {
      pendingFlight = await prisma.flightLogbook.findFirst({
        where: {
          planeId: plane.id,
          status: FLIGHT_STATUS.PENDING,
          deleted: { not: true }
        },
        orderBy: { createdAt: 'asc' }
      });
    }
    
    // Create a new flight log entry if no match
    // Check for private plane assignment for today
    const privateAssignment = await getPrivatePlaneAssignment(plane?.id, plane?.clubId);
    
    const flightLog = await prisma.flightLogbook.create({
      data: {
        flarm_id: flarmId,
        registration: registration,
        type: aircraftType,
        competition_number: competitionNumber,
        planeId: plane?.id,
        clubId: plane?.clubId,
        takeoff_time: now,
        takeoff_airfield: airfield,
        status: FLIGHT_STATUS.INFLIGHT,
        // Auto-assign pilots from private plane assignment if available
        pilot1Id: privateAssignment?.pilot1Id || null,
        pilot2Id: privateAssignment?.pilot2Id || null,
        guest_pilot1_name: privateAssignment?.guest_pilot1_name || null,
        guest_pilot2_name: privateAssignment?.guest_pilot2_name || null,
        is_school_flight: privateAssignment?.isSchoolFlight || false,
        launch_method: privateAssignment?.launchMethod || 'S'
      },
    });
    
    if (privateAssignment) {
      console.log(`Webhook: Auto-assigned pilots to flight from private plane assignment for plane ${plane?.registration_id}`);
    }

    // Increment the plane's start count if there's a plane ID
    if (plane?.id) {
      try {
        // Use MongoDB-specific command to increment the starts field
        await prisma.$runCommandRaw({
          update: "planes",
          updates: [
            {
              q: { _id: { $oid: plane.id } },
              u: { $inc: { starts: 1 } },
            },
          ],
        });
        console.log(`Incremented start count for plane ID: ${plane.id}`);
      } catch (error) {
        console.error('Error incrementing plane starts:', error);
      }
    }

    // For newly created flights, we don't have pilot IDs directly from the flight creation
    // But if we're receiving a webhook event, we might add pilot info later

    // Get complete flight data for WebSocket broadcast
    const completeFlightData = await getCompleteFlightData(flightLog.id);
    
    if (completeFlightData) {
      // Broadcast the complete flight data to WebSocket clients
      broadcastToClients({
        type: 'flight_update',
        event: type,
        data: completeFlightData,
        isNewFlight: true
      }, airfield);
    }

    return NextResponse.json({
      success: true,
      message: 'No matching flight found. Created new flight with takeoff info.',
      flightLog,
    });
  }
  
  // For landing events (landing and udlanding)
  if (type === 'landing' || type === 'udlanding') {
    // First: Try to find an in-flight record with the same FLARM ID
    let inFlightRecord = await prisma.flightLogbook.findFirst({
      where: {
        flarm_id: flarmId,
        status: FLIGHT_STATUS.INFLIGHT,
        deleted: { not: true }
      },
      orderBy: { createdAt: 'asc' }
    });
    
    if (inFlightRecord) {
      // Calculate flight duration
      let flightDuration = null;
      if (inFlightRecord.takeoff_time) {
        const durationMs = now.getTime() - inFlightRecord.takeoff_time.getTime();
        flightDuration = Math.floor(durationMs / 60000); // Convert to minutes
      }
      
      const updatedFlight = await prisma.flightLogbook.update({
        where: { id: inFlightRecord.id },
        data: {
          landing_time: now,
          landing_airfield: airfield,
          flight_duration: flightDuration,
          status: FLIGHT_STATUS.LANDED
        },
      });
      
      // If plane exists, update its flight time
      if (plane?.id && flightDuration) {
        await prisma.plane.update({
          where: { id: plane.id },
          data: {
            flight_time: {
              increment: flightDuration
            }
          }
        });
      }
      
      // Calculate flight statistics if we landed
      try {
        console.log(`Calculating flight statistics for flight ID: ${updatedFlight.id}`);
        const statistics = await calculateFlightStatistics(updatedFlight.id);
        
        if (statistics.calculationSuccessful) {
          // Use $runCommandRaw to bypass TypeScript since schema migration might not be run yet
          await prisma.$runCommandRaw({
            update: "flight_logbook",
            updates: [
              {
                q: { _id: { $oid: updatedFlight.id } },
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
          
          console.log(`Webhook: Updated flight ${updatedFlight.id} with statistics:`, statistics);
        } else {
          console.log(`Webhook: No valid FLARM data found for flight ${updatedFlight.id} or calculation failed`);
        }
      } catch (error) {
        console.error('Webhook: Error calculating or updating flight statistics:', error);
        // Continue with the response even if statistics calculation fails
      }
      
      // Get complete flight data for WebSocket broadcast
      const completeFlightData = await getCompleteFlightData(updatedFlight.id);
      
      if (completeFlightData) {
        // Broadcast the complete flight data to WebSocket clients
        broadcastToClients({
          type: 'flight_update',
          event: type,
          data: completeFlightData,
          isNewFlight: false
        }, airfield);
      }
      
      return NextResponse.json({
        success: true,
        message: 'Landing recorded for in-flight flight',
        flightLog: updatedFlight,
      });
    }
    
    // Second: Try to find an in-flight record with the same registration
    if (!inFlightRecord && registration) {
      inFlightRecord = await prisma.flightLogbook.findFirst({
        where: {
          registration: registration,
          status: FLIGHT_STATUS.INFLIGHT,
          deleted: { not: true }
        },
        orderBy: { createdAt: 'asc' } // FIFO: Match oldest in-flight first
      });
    }
    
    // Third: Try to find any pending flight with matching identifiers
    let pendingFlight = null;
    
    // Try by FLARM ID first
    pendingFlight = await prisma.flightLogbook.findFirst({
      where: {
        flarm_id: flarmId,
        status: FLIGHT_STATUS.PENDING,
        deleted: { not: true }
      },
      orderBy: { createdAt: 'asc' } // FIFO: Match oldest pending flight first
    });
    
    if (!pendingFlight && registration) {
      // Try by registration
      pendingFlight = await prisma.flightLogbook.findFirst({
        where: {
          registration: registration,
          status: FLIGHT_STATUS.PENDING,
          deleted: { not: true }
        },
        orderBy: { createdAt: 'asc' } // FIFO: Match oldest pending flight first
      });
    }
    
    if (!pendingFlight && plane?.id) {
      // Try by plane ID
      pendingFlight = await prisma.flightLogbook.findFirst({
        where: {
          planeId: plane.id,
          status: FLIGHT_STATUS.PENDING,
          deleted: { not: true }
        },
        orderBy: { createdAt: 'asc' } // FIFO: Match oldest pending flight first
      });
    }
    
    if (pendingFlight) {
      const updatedFlight = await prisma.flightLogbook.update({
        where: { id: pendingFlight.id },
        data: {
          flarm_id: flarmId,
          landing_time: now,
          landing_airfield: airfield,
          status: FLIGHT_STATUS.LANDED
        },
      });
      
      // Get complete flight data for WebSocket broadcast
      const completeFlightData = await getCompleteFlightData(updatedFlight.id);
      
      if (completeFlightData) {
        // Broadcast the complete flight data to WebSocket clients
        broadcastToClients({
          type: 'flight_update',
          event: type,
          data: completeFlightData,
          isNewFlight: false
        }, airfield);
      }
      
      return NextResponse.json({
        success: true,
        message: 'Landing recorded for pending flight without takeoff data',
        flightLog: updatedFlight,
      });
    }
    
    // Create a new landing-only entry
    const flightLog = await prisma.flightLogbook.create({
      data: {
        flarm_id: flarmId,
        registration: registration,
        type: aircraftType,
        competition_number: competitionNumber,
        planeId: plane?.id,
        clubId: plane?.clubId,
        landing_time: now,
        landing_airfield: airfield,
        status: FLIGHT_STATUS.LANDED
      },
    });

    // Get complete flight data for WebSocket broadcast
    const completeFlightData = await getCompleteFlightData(flightLog.id);
    
    if (completeFlightData) {
      // Broadcast the complete flight data to WebSocket clients
      broadcastToClients({
        type: 'flight_update',
        event: type,
        data: completeFlightData,
        isNewFlight: true
      }, airfield);
    }

    return NextResponse.json({
      success: true,
      message: 'Landing recorded (no matching takeoff found)',
      flightLog,
    });
  }

  return NextResponse.json({ success: false, error: 'Invalid event type' }, { status: 400 });
} 