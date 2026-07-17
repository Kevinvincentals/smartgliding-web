import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { VEHICLE_ICON_KEYS, normalizeOgnId } from '@/lib/vehicle-icons'

// Validation schema for updating a ground vehicle
const updateVehicleSchema = z.object({
  vehicleId: z.string().min(1, 'Vehicle ID is required'),
  name: z.string().min(1, 'Name is required').optional(),
  icon: z.enum(VEHICLE_ICON_KEYS).optional(),
  ogn_id: z.string().min(1, 'OGN ID is required').optional()
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

    if (!clubId) {
      return NextResponse.json(
        { error: 'Club ID not found in admin session' },
        { status: 400 }
      )
    }

    // Parse and validate request body
    const body = await request.json()
    const validatedData = updateVehicleSchema.parse(body)

    // Get the vehicle and verify it belongs to this club
    const vehicle = await prisma.groundVehicle.findUnique({
      where: { id: validatedData.vehicleId }
    })

    if (!vehicle) {
      return NextResponse.json(
        { error: 'Vehicle not found' },
        { status: 404 }
      )
    }

    if (vehicle.clubId !== clubId) {
      return NextResponse.json(
        { error: 'Vehicle does not belong to this club' },
        { status: 403 }
      )
    }

    // Prepare update data (only include fields that are provided)
    const updateData: any = {}

    if (validatedData.name !== undefined) updateData.name = validatedData.name
    if (validatedData.icon !== undefined) updateData.icon = validatedData.icon

    if (validatedData.ogn_id !== undefined) {
      const ognId = normalizeOgnId(validatedData.ogn_id)
      if (!/^[0-9A-F]{6}$/.test(ognId)) {
        return NextResponse.json(
          { error: 'OGN ID must be a 6-character hex device ID (optionally prefixed with FLR/OGN/ICA)' },
          { status: 400 }
        )
      }

      if (ognId !== vehicle.ogn_id) {
        // Check if the new OGN ID is already used by another vehicle in this club
        const existingVehicle = await prisma.groundVehicle.findFirst({
          where: { clubId, ogn_id: ognId, id: { not: vehicle.id } }
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
      }

      updateData.ogn_id = ognId
    }

    // Update the vehicle
    const updatedVehicle = await prisma.groundVehicle.update({
      where: { id: validatedData.vehicleId },
      data: updateData,
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
        message: 'Vehicle updated successfully',
        vehicle: updatedVehicle
      },
      { status: 200 }
    )
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.errors },
        { status: 400 }
      )
    }

    console.error('Update vehicle error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
