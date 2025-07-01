import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

// Validation schema for plane ID
const planeIdSchema = z.object({
  planeId: z.string().min(1, 'Plane ID is required')
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
    const validatedData = planeIdSchema.parse(body)

    // Get the plane and verify it belongs to this club
    const plane = await prisma.plane.findUnique({
      where: { id: validatedData.planeId }
    })

    if (!plane) {
      return NextResponse.json(
        { error: 'Plane not found' },
        { status: 404 }
      )
    }

    if (plane.clubId !== clubId) {
      return NextResponse.json(
        { error: 'Plane does not belong to this club' },
        { status: 403 }
      )
    }

    // Delete the plane
    await prisma.plane.delete({
      where: { id: validatedData.planeId }
    })

    return NextResponse.json(
      { 
        message: 'Plane deleted successfully'
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

    console.error('Delete plane error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
} 