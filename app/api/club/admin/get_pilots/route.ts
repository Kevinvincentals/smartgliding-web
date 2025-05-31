import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

// Validation schema for club ID
const clubIdSchema = z.object({
  clubId: z.string().min(1, 'Club ID is required')
})

export async function GET(request: Request) {
  try {
    // Get user ID from headers (set by middleware)
    const userId = request.headers.get('x-user-id')
    
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

    // Fetch all pilots assigned to the club
    const clubPilots = await prisma.clubPilot.findMany({
      where: {
        clubId: validatedData.clubId
      },
      include: {
        pilot: {
          select: {
            id: true,
            firstname: true,
            lastname: true,
            email: true,
            phone: true,
            dsvu_id: true,
            status: true,
            membership: true
          }
        }
      },
      orderBy: {
        pilot: {
          lastname: 'asc'
        }
      }
    })

    return NextResponse.json(
      { 
        message: 'Pilots fetched successfully',
        clubPilots
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

    console.error('Get pilots error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
