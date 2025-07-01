import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

// Validation schema for creating a plane
const createPlaneSchema = z.object({
  registration_id: z.string().min(1, 'Registration ID is required'),
  flarm_id: z.string().nullable().optional(),
  competition_id: z.string().nullable().optional(),
  type: z.string().min(1, 'Type is required'),
  is_twoseater: z.boolean().default(false),
  is_guest: z.boolean().default(false),
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
    const validatedData = createPlaneSchema.parse(body)

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

    // Check if registration_id is unique
    const existingPlane = await prisma.plane.findUnique({
      where: { registration_id: validatedData.registration_id }
    })

    if (existingPlane) {
      return NextResponse.json(
        { error: 'A plane with this registration ID already exists' },
        { status: 409 }
      )
    }

    // Create the plane
    const plane = await prisma.plane.create({
      data: {
        ...validatedData,
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
        message: 'Plane created successfully',
        plane
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

    console.error('Create plane error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
} 