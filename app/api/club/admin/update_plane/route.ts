import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

// Validation schema for updating a plane
const updatePlaneSchema = z.object({
  planeId: z.string().min(1, 'Plane ID is required'),
  registration_id: z.string().min(1, 'Registration ID is required').optional(),
  flarm_id: z.string().nullable().optional(),
  competition_id: z.string().nullable().optional(),
  type: z.string().min(1, 'Type is required').optional(),
  is_twoseater: z.boolean().optional(),
  is_guest: z.boolean().optional(),
  year_produced: z.number().int().nullable().optional(),
  notes: z.string().nullable().optional()
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
    const validatedData = updatePlaneSchema.parse(body)

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

    // Prepare update data (only include fields that are provided)
    const updateData: any = {}
    
    if (validatedData.registration_id !== undefined) updateData.registration_id = validatedData.registration_id
    if (validatedData.flarm_id !== undefined) updateData.flarm_id = validatedData.flarm_id
    if (validatedData.competition_id !== undefined) updateData.competition_id = validatedData.competition_id
    if (validatedData.type !== undefined) updateData.type = validatedData.type
    if (validatedData.is_twoseater !== undefined) updateData.is_twoseater = validatedData.is_twoseater
    if (validatedData.is_guest !== undefined) updateData.is_guest = validatedData.is_guest
    if (validatedData.year_produced !== undefined) updateData.year_produced = validatedData.year_produced
    if (validatedData.notes !== undefined) updateData.notes = validatedData.notes

    // Update the plane
    const updatedPlane = await prisma.plane.update({
      where: { id: validatedData.planeId },
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