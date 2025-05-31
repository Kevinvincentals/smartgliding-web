import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

// Validation schema for plane ID
const planeIdSchema = z.object({
  planeId: z.string().min(1, 'Plane ID is required')
})

export async function DELETE(request: Request) {
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
    const validatedData = planeIdSchema.parse(body)

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