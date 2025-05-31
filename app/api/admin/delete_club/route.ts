import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

// Validation schema for club deletion
const deleteClubSchema = z.object({
  clubId: z.string().min(1, 'Club ID is required')
})

export async function POST(request: Request) {
  try {
    // Parse and validate request body
    const body = await request.json()
    const validatedData = deleteClubSchema.parse(body)

    // Check if club exists
    const club = await prisma.club.findUnique({
      where: { 
        id: validatedData.clubId
      },
      include: {
        pilots: {
          select: {
            id: true,
            pilot: {
              select: {
                id: true,
                firstname: true,
                lastname: true,
                email: true
              }
            }
          }
        },
        planes: {
          select: {
            id: true,
            registration_id: true,
            type: true
          }
        }
      }
    })

    if (!club) {
      return NextResponse.json(
        { error: 'Club not found' },
        { status: 404 }
      )
    }

    // Delete the club (this will cascade delete related records)
    await prisma.club.delete({
      where: {
        id: validatedData.clubId
      }
    })

    return NextResponse.json(
      { 
        message: 'Club deleted successfully',
        deletedClub: {
          id: club.id,
          name: club.name,
          pilots: club.pilots.map(p => ({
            id: p.pilot.id,
            firstname: p.pilot.firstname,
            lastname: p.pilot.lastname,
            email: p.pilot.email
          })),
          planes: club.planes.map(p => ({
            id: p.id,
            registration_id: p.registration_id,
            type: p.type
          }))
        }
      },
      { status: 200 }
    )
  } catch (error) {
    if (error instanceof Error && error.message.includes('Record to delete does not exist')) {
      return NextResponse.json(
        { error: 'Club not found' },
        { status: 404 }
      )
    }
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.errors },
        { status: 400 }
      )
    }

    console.error('Delete club error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
} 