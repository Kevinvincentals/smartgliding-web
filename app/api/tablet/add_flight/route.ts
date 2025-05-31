import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { broadcastToClients } from '@/lib/websocket/utils'
import type { JWTPayload, ApiResponse } from '@/types/tablet-api'
import type { LaunchMethod } from '@/types/flight'
import { createFlightRequestSchema, validateRequestBody } from '@/lib/validations/tablet-api'

/**
 * Flight creation response
 */
interface CreateFlightResponse extends ApiResponse {
  flight?: Record<string, unknown>
}

/**
 * Creates a new flight record
 * Handles both club member pilots and guest pilots
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // Parse and validate request body
    const body = await request.json()
    
    // Validate request body with Zod
    const validation = validateRequestBody(createFlightRequestSchema, body)
    if (!validation.success) {
      return NextResponse.json<CreateFlightResponse>(
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
      return NextResponse.json<CreateFlightResponse>(
        { success: false, error: 'Authentication token not found in request headers.' },
        { status: 401 }
      )
    }

    const jwtPayload: JWTPayload = JSON.parse(jwtPayloadString)
    const clubId = jwtPayload.clubId || jwtPayload.id

    if (!clubId) {
      return NextResponse.json<CreateFlightResponse>(
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

    // Create flight data object with proper typing
    const flightData = {
      flarm_id: planeFlarmId || (aircraft.hasFlarm ? (aircraft.flarmId || 'unknown') : 'none'),
      registration: aircraft.registration,
      type: aircraft.type,
      competition_number: aircraft.competitionId,
      is_school_flight: isSchoolFlight,
      launch_method: launchMethod as LaunchMethod,
      planeId: planeId,
      clubId: clubId,
      takeoff_airfield: startField,
      pilot1Id: null as string | null,
      pilot2Id: null as string | null,
      guest_pilot1_name: null as string | null,
      guest_pilot2_name: null as string | null,
    }

    // Handle pilot - check if club member or guest
    if (pilot) {
      if (typeof pilot.id === 'string' && /^[0-9a-fA-F]{24}$/.test(pilot.id)) {
        // Club member with valid MongoDB ID
        const existingPilot = await prisma.pilot.findUnique({
          where: { id: pilot.id }
        })
        
        if (existingPilot) {
          flightData.pilot1Id = existingPilot.id
        }
      } else if (pilot.name) {
        // Guest pilot - store name only
        flightData.guest_pilot1_name = pilot.name
      }
    }

    // Handle co-pilot with same logic
    if (coPilot) {
      if (typeof coPilot.id === 'string' && /^[0-9a-fA-F]{24}$/.test(coPilot.id)) {
        const existingCoPilot = await prisma.pilot.findUnique({
          where: { id: coPilot.id }
        })
        
        if (existingCoPilot) {
          flightData.pilot2Id = existingCoPilot.id
        }
      } else if (coPilot.name) {
        flightData.guest_pilot2_name = coPilot.name
      }
    }

    // Create the flight record
    const newFlight = await prisma.flightLogbook.create({
      data: flightData,
      include: {
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

    // Format response data - only include relevant fields for a newly created flight
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
      plane: newFlight.plane ? {
        ...newFlight.plane,
        has_valid_flarm: Boolean(newFlight.plane.flarm_id && newFlight.plane.flarm_id !== 'none' && newFlight.plane.flarm_id !== 'unknown')
      } : {
        id: null,
        registration_id: newFlight.registration || 'Unknown',
        type: newFlight.type || 'Unknown', 
        competition_id: newFlight.competition_number || null,
        is_twoseater: true,
        flarm_id: newFlight.flarm_id,
        has_valid_flarm: Boolean(newFlight.flarm_id && newFlight.flarm_id !== 'none' && newFlight.flarm_id !== 'unknown')
      }
    }


    // Determine target airfield for WebSocket broadcast
    const targetAirfield = newFlight.takeoff_airfield || "unknown"
    if (targetAirfield === "unknown") {
      console.warn(`AddFlight: Could not determine target airfield for new flight. Broadcasting might be too broad or fail to infer.`)
    }

    // Broadcast flight creation to WebSocket clients
    broadcastToClients({
      type: 'flight_update',
      event: 'flight_created',
      data: responseData,
      isNewFlight: true,
      message: 'Ny flyvning planlagt'
    }, targetAirfield)

    return NextResponse.json({ success: true })

  } catch (error: unknown) {
    console.error('Error creating flight:', error)
    
    // Enhanced error handling for Prisma errors
    if (error && typeof error === 'object' && 'code' in error) {
      const prismaError = error as { code: string; message?: string }
      
      if (prismaError.code === 'P2025') {
        return NextResponse.json<CreateFlightResponse>(
          { success: false, error: 'Referenced entity not found' },
          { status: 404 }
        )
      } else if (prismaError.code === 'P2003') {
        return NextResponse.json<CreateFlightResponse>(
          { success: false, error: 'Invalid reference (pilot or club ID not found)' },
          { status: 400 }
        )
      }
    }
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
    return NextResponse.json<CreateFlightResponse>(
      { success: false, error: `Failed to create flight: ${errorMessage}` },
      { status: 500 }
    )
  }
} 