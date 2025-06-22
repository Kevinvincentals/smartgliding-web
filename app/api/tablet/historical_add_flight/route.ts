import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import type { JWTPayload, ApiResponse } from '@/types/tablet-api'
import type { LaunchMethod } from '@/types/flight'
import { createFlightRequestSchema, validateRequestBody } from '@/lib/validations/tablet-api'
import { getStartOfTimezoneDayUTC, getEndOfTimezoneDayUTC, localTimeStringToUTC } from '@/lib/time-utils'
import { FlightStatus } from '@prisma/client'

/**
 * Historical flight creation response
 */
interface CreateHistoricalFlightResponse extends ApiResponse {
  flight?: Record<string, unknown>
  message?: string
}

/**
 * Creates a new flight record for a specific historical date
 * Does not trigger WebSocket broadcasts - for historical data management only
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // Parse and validate request body
    const body = await request.json()
    
    // Validate that date is provided and extract times
    const { date, takeoffTime, landingTime, ...flightData } = body;
    if (!date) {
      return NextResponse.json<CreateHistoricalFlightResponse>(
        { 
          success: false, 
          error: 'Date parameter is required for historical flight creation (format: YYYY-MM-DD)'
        },
        { status: 400 }
      )
    }

    // Validate date format
    const targetDate = new Date(date);
    if (isNaN(targetDate.getTime())) {
      return NextResponse.json<CreateHistoricalFlightResponse>(
        { 
          success: false, 
          error: 'Invalid date format. Use YYYY-MM-DD'
        }, 
        { status: 400 }
      );
    }

    // Validate request body with Zod (excluding the date field)
    const validation = validateRequestBody(createFlightRequestSchema, flightData)
    if (!validation.success) {
      return NextResponse.json<CreateHistoricalFlightResponse>(
        { 
          success: false, 
          error: validation.error,
          ...(validation.details && { details: validation.details.join(', ') })
        },
        { status: 400 }
      )
    }

    const data = validation.data
    
    // Get JWT payload from headers (set by middleware)
    const jwtPayloadString = request.headers.get('x-jwt-payload')
    if (!jwtPayloadString) {
      return NextResponse.json<CreateHistoricalFlightResponse>(
        { success: false, error: 'Authentication token not found in request headers.' },
        { status: 401 }
      )
    }

    const jwtPayload: JWTPayload = JSON.parse(jwtPayloadString)
    const clubId = jwtPayload.clubId || jwtPayload.id

    if (!clubId) {
      return NextResponse.json<CreateHistoricalFlightResponse>(
        { success: false, error: 'Club ID not found in authentication token.' },
        { status: 401 }
      )
    }

    // Destructure validated properties
    const {
      aircraft,
      pilot,
      coPilot,
      isSchoolFlight,
      startField,
      launchMethod,
    } = data

    // Check if the plane exists in the database
    let planeId: string | null = null
    let planeFlarmId: string | null = null
    
    // First try to find by ObjectId if aircraft.id is a valid MongoDB ObjectId
    if (typeof aircraft.id === 'string' && /^[0-9a-fA-F]{24}$/.test(aircraft.id)) {
      const existingPlane = await prisma.plane.findUnique({
        where: { id: aircraft.id }
      })
      
      if (existingPlane) {
        planeId = existingPlane.id
        planeFlarmId = existingPlane.flarm_id
      }
    }
    
    // If not found by ObjectId, try to find by registration
    if (!planeId && aircraft.registration) {
      const existingPlane = await prisma.plane.findFirst({
        where: { 
          registration_id: aircraft.registration,
          clubId: clubId
        }
      })
      
      if (existingPlane) {
        planeId = existingPlane.id
        planeFlarmId = existingPlane.flarm_id
      }
    }

    // Calculate the target date's start time in UTC for createdAt
    const historicalCreatedAt = getStartOfTimezoneDayUTC(targetDate);

    // Convert times if provided
    let takeoffTimeUTC = null;
    let landingTimeUTC = null;
    let flightStatus: FlightStatus = FlightStatus.PENDING;
    
    if (takeoffTime) {
      takeoffTimeUTC = localTimeStringToUTC(takeoffTime);
      if (takeoffTimeUTC) {
        // Adjust the takeoff time to the historical date
        const historicalTakeoff = new Date(targetDate);
        historicalTakeoff.setHours(takeoffTimeUTC.getHours(), takeoffTimeUTC.getMinutes(), takeoffTimeUTC.getSeconds());
        takeoffTimeUTC = historicalTakeoff;
        flightStatus = FlightStatus.INFLIGHT;
      }
    }
    
    if (landingTime) {
      landingTimeUTC = localTimeStringToUTC(landingTime);
      if (landingTimeUTC) {
        // Adjust the landing time to the historical date
        const historicalLanding = new Date(targetDate);
        historicalLanding.setHours(landingTimeUTC.getHours(), landingTimeUTC.getMinutes(), landingTimeUTC.getSeconds());
        landingTimeUTC = historicalLanding;
        if (takeoffTimeUTC) {
          flightStatus = FlightStatus.COMPLETED;
        } else {
          flightStatus = FlightStatus.LANDED;
        }
      }
    }

    // Create flight data object with historical timestamp
    const historicalFlightData = {
      flarm_id: planeFlarmId || (aircraft.hasFlarm ? (aircraft.flarmId || 'unknown') : 'none'),
      registration: aircraft.registration,
      type: aircraft.type,
      competition_number: aircraft.competitionId,
      is_school_flight: isSchoolFlight,
      launch_method: launchMethod as LaunchMethod,
      planeId: planeId,
      clubId: clubId,
      takeoff_airfield: startField,
      takeoff_time: takeoffTimeUTC,
      landing_time: landingTimeUTC,
      status: flightStatus,
      pilot1Id: null as string | null,
      pilot2Id: null as string | null,
      guest_pilot1_name: null as string | null,
      guest_pilot2_name: null as string | null,
      createdAt: historicalCreatedAt, // Set to historical date instead of now
      updatedAt: historicalCreatedAt, // Set to historical date instead of now
      notes: `Historical flight for ${date}`, // Mark as historical flight
    }

    // Handle pilot - check if club member or guest
    if (pilot) {
      if (typeof pilot.id === 'string' && /^[0-9a-fA-F]{24}$/.test(pilot.id)) {
        // Club member with valid MongoDB ID
        const existingPilot = await prisma.pilot.findUnique({
          where: { id: pilot.id }
        })
        
        if (existingPilot) {
          historicalFlightData.pilot1Id = existingPilot.id
        }
      } else if (pilot.name) {
        // Guest pilot - store name only
        historicalFlightData.guest_pilot1_name = pilot.name
      }
    }

    // Handle co-pilot with same logic
    if (coPilot) {
      if (typeof coPilot.id === 'string' && /^[0-9a-fA-F]{24}$/.test(coPilot.id)) {
        const existingCoPilot = await prisma.pilot.findUnique({
          where: { id: coPilot.id }
        })
        
        if (existingCoPilot) {
          historicalFlightData.pilot2Id = existingCoPilot.id
        }
      } else if (coPilot.name) {
        historicalFlightData.guest_pilot2_name = coPilot.name
      }
    }

    // Create the historical flight record
    const newFlight = await prisma.flightLogbook.create({
      data: historicalFlightData,
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
        takeoff_airfield: true,
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
    })

    // Format response data
    const responseData = {
      id: newFlight.id,
      flarm_id: newFlight.flarm_id,
      registration: newFlight.registration,
      type: newFlight.type,
      competition_number: newFlight.competition_number,
      pilot1Id: newFlight.pilot1Id,
      guest_pilot1_name: newFlight.guest_pilot1_name,
      pilot2Id: newFlight.pilot2Id,
      guest_pilot2_name: newFlight.guest_pilot2_name,
      is_school_flight: newFlight.is_school_flight,
      launch_method: newFlight.launch_method,
      planeId: newFlight.planeId,
      clubId: newFlight.clubId,
      takeoff_airfield: newFlight.takeoff_airfield,
      status: newFlight.status,
      deleted: newFlight.deleted,
      createdAt: newFlight.createdAt,
      updatedAt: newFlight.updatedAt,
      pilot1: newFlight.pilot1,
      pilot2: newFlight.pilot2,
      plane: newFlight.plane
    }

    // Note: No WebSocket broadcast for historical flights
    console.log(`Historical flight created for date ${date}:`, newFlight.id);
    console.log(`Historical flight FLARM ID: ${newFlight.flarm_id}, Registration: ${newFlight.registration}`);

    return NextResponse.json<CreateHistoricalFlightResponse>({
      success: true,
      message: 'Historical flight created successfully',
      flight: responseData
    })

  } catch (error) {
    console.error('Error creating historical flight:', error)
    return NextResponse.json<CreateHistoricalFlightResponse>(
      { success: false, error: 'Failed to create historical flight' },
      { status: 500 }
    )
  }
}