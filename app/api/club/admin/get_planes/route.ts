import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

// Validation schema for club ID
const clubIdSchema = z.object({
  clubId: z.string().min(1, 'Club ID is required')
})

export async function GET(request: Request) {
  try {
    // Get user ID and admin status from headers (set by middleware)
    const userId = request.headers.get('x-user-id')
    const isAdmin = request.headers.get('x-user-is-admin') === 'true'
    
    if (!userId) {
      return NextResponse.json(
        { error: 'User ID not found in request' },
        { status: 500 }
      )
    }
    
    // Get club ID from URL search params
    const { searchParams } = new URL(request.url)
    const clubId = searchParams.get('clubId')

    // Validate club ID
    const validatedData = clubIdSchema.parse({ clubId })

    // Check if club exists and is active
    const club = await prisma.club.findUnique({
      where: { 
        id: validatedData.clubId,
        status: 'active'
      }
    })

    if (!club) {
      return NextResponse.json(
        { error: 'Club not found or not active' },
        { status: 404 }
      )
    }

    // Fetch all planes for the club
    const planes = await prisma.plane.findMany({
      where: {
        clubId: validatedData.clubId
      },
      include: {
        club: {
          select: {
            id: true,
            name: true
          }
        }
      },
      orderBy: {
        registration_id: 'asc'
      }
    })

    return NextResponse.json(
      { 
        message: 'Planes fetched successfully',
        planes
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

    console.error('Get planes error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
} 