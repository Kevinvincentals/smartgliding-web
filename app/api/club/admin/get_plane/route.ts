import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

// Validation schema for plane ID
const planeIdSchema = z.object({
  planeId: z.string().min(1, 'Plane ID is required')
})

export async function GET(request: Request) {
  try {
    // Get user ID from headers (set by middleware)
    const userId = request.headers.get('x-user-id')
    
    if (!userId) {
      return NextResponse.json(
        { error: 'User ID not found in request' },
        { status: 500 }
      )
    }
    
    // Get plane ID from URL search params
    const { searchParams } = new URL(request.url)
    const planeId = searchParams.get('planeId')

    // Validate plane ID
    const validatedData = planeIdSchema.parse({ planeId })

    // Get the plane
    const plane = await prisma.plane.findUnique({
      where: { id: validatedData.planeId },
      include: {
        club: {
          select: {
            id: true,
            name: true
          }
        }
      }
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

    return NextResponse.json(
      { 
        message: 'Plane fetched successfully',
        plane
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

    console.error('Get plane error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
} 