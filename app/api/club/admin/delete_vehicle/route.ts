import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

// Validation schema for vehicle ID
const vehicleIdSchema = z.object({
  vehicleId: z.string().min(1, 'Vehicle ID is required')
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
    const validatedData = vehicleIdSchema.parse(body)

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

    // Delete the vehicle
    await prisma.groundVehicle.delete({
      where: { id: validatedData.vehicleId }
    })

    return NextResponse.json(
      {
        message: 'Vehicle deleted successfully'
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

    console.error('Delete vehicle error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
