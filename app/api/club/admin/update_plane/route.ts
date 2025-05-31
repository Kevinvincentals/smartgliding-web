import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

// Validation schema for updating a plane
const updatePlaneSchema = z.object({
  planeId: z.string().min(1, 'Plane ID is required'),
  registration_id: z.string().min(1, 'Registration ID is required').optional(),
  flarm_id: z.string().optional(),
  competition_id: z.string().optional(),
  type: z.string().min(1, 'Type is required').optional(),
  is_twoseater: z.boolean().optional(),
  year_produced: z.number().int().optional(),
  notes: z.string().optional()
})

export async function PUT(request: Request) {
  try {
    // Get user ID from headers (set by middleware)
    const userId = request.headers.get('x-user-id')
    
    if (!userId) {
      return NextResponse.json(
        { error: 'User ID not found in request' },
        { status: 500 }
      )
    }
    
    // Parse and validate request body
    const body = await request.json()
    const validatedData = updatePlaneSchema.parse(body)

    // Get the plane
    const plane = await prisma.plane.findUnique({
      where: { id: validatedData.planeId }
    })

    if (!plane) {
      return NextResponse.json(
        { error: 'Plane not found' },
        { status: 404 }
      )
    }

    // Check if user is a club admin or system admin
    const clubAdmin = await prisma.clubPilot.findFirst({
      where: {
        pilotId: userId,
        clubId: plane.clubId,
        role: 'ADMIN'
      }
    })

    const systemAdmin = await prisma.pilot.findUnique({
      where: { 
        id: userId,
        is_admin: true
      }
    })

    if (!clubAdmin && !systemAdmin) {
      return NextResponse.json(
        { error: 'Unauthorized: You must be a club admin or system admin' },
        { status: 403 }
      )
    }

    // Check if new registration_id is unique (if being updated)
    if (validatedData.registration_id && validatedData.registration_id !== plane.registration_id) {
      const existingPlane = await prisma.plane.findUnique({
        where: { registration_id: validatedData.registration_id }
      })

      if (existingPlane) {
        return NextResponse.json(
          { error: 'A plane with this registration ID already exists' },
          { status: 409 }
        )
      }
    }

    // Update the plane
    const updatedPlane = await prisma.plane.update({
      where: { id: validatedData.planeId },
      data: {
        registration_id: validatedData.registration_id,
        flarm_id: validatedData.flarm_id,
        competition_id: validatedData.competition_id,
        type: validatedData.type,
        is_twoseater: validatedData.is_twoseater,
        year_produced: validatedData.year_produced,
        notes: validatedData.notes
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
        message: 'Plane updated successfully',
        plane: updatedPlane
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

    console.error('Update plane error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
} 