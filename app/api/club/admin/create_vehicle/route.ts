import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { VEHICLE_ICON_KEYS, normalizeOgnId } from '@/lib/vehicle-icons'

// Validation schema for creating a ground vehicle
const createVehicleSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  icon: z.enum(VEHICLE_ICON_KEYS),
  ogn_id: z.string().min(1, 'OGN ID is required')
})

export async function POST(request: Request) {
  try {
    // Get admin JWT payload from middleware (admin authentication)
    const adminJwtPayload = request.headers.get('x-admin-jwt-payload')
    if (!adminJwtPayload) {
      return NextResponse.json(
        { error: 'Admin authentication required' },
        { status: 401 }
      )
    }

    const payload = JSON.parse(adminJwtPayload)
    const clubId = payload.adminContext?.clubId
    const userId = payload.id // Use 'id' field which contains the pilot ID

    if (!clubId) {
      return NextResponse.json(
        { error: 'Club ID not found in admin session' },
        { status: 400 }
      )
    }

    if (!userId) {
      return NextResponse.json(
        { error: 'User ID not found in admin session' },
        { status: 400 }
      )
    }

    // Parse and validate request body
    const body = await request.json()
    const validatedData = createVehicleSchema.parse(body)

    const ognId = normalizeOgnId(validatedData.ogn_id)
    if (!/^[0-9A-F]{6}$/.test(ognId)) {
      return NextResponse.json(
        { error: 'OGN ID must be a 6-character hex device ID (optionally prefixed with FLR/OGN/ICA)' },
        { status: 400 }
      )
    }

    // Check if club exists and is active
    const club = await prisma.club.findUnique({
      where: {
        id: clubId,
        status: 'active'
      }
    })

    if (!club) {
      return NextResponse.json(
        { error: 'Club not found or not active' },
        { status: 404 }
      )
    }

    // Check if the OGN ID is already used by another vehicle in this club
    const existingVehicle = await prisma.groundVehicle.findFirst({
      where: { clubId, ogn_id: ognId }
    })

    if (existingVehicle) {
      return NextResponse.json(
        { error: 'A vehicle with this OGN ID already exists' },
        { status: 409 }
      )
    }

    // Reject if the OGN ID belongs to a club plane
    const existingPlane = await prisma.plane.findFirst({
      where: { clubId, flarm_id: ognId }
    })

    if (existingPlane) {
      return NextResponse.json(
        { error: `This OGN ID is already used by the plane ${existingPlane.registration_id}` },
        { status: 409 }
      )
    }

    // Create the vehicle
    const vehicle = await prisma.groundVehicle.create({
      data: {
        name: validatedData.name,
        icon: validatedData.icon,
        ogn_id: ognId,
        clubId: clubId,
        createdById: userId
      },
      include: {
        club: {
          select: {
            id: true,
            name: true
          }
        }
      }
    })

    return NextResponse.json(
      {
        message: 'Vehicle created successfully',
        vehicle
      },
      { status: 201 }
    )
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.errors },
        { status: 400 }
      )
    }

    console.error('Create vehicle error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
