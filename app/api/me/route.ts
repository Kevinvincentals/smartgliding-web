import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { headers } from 'next/headers'

interface ClubPilot {
  club: {
    id: string
    name: string
    city: string
    country: string
  }
  role: string
}

export async function GET() {
  try {
    // Get user ID from headers (set by middleware)
    const headersList = await headers()
    const userId = headersList.get('x-user-id')

    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Fetch user data
    const user = await prisma.pilot.findUnique({
      where: { id: userId },
      select: {
        id: true,
        firstname: true,
        lastname: true,
        email: true,
        phone: true,
        status: true,
        membership: true,
        is_admin: true,
        dsvu_id: true,
        createdAt: true,
        updatedAt: true,
        clubs: {
          select: {
            club: {
              select: {
                id: true,
                name: true,
                city: true,
                country: true,
              }
            },
            role: true
          }
        },
        createdClubs: {
          select: {
            id: true,
            name: true,
            city: true,
            country: true,
          }
        }
      }
    })

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      )
    }

    // Transform the clubs data to a more convenient format
    const transformedUser = {
      ...user,
      clubs: (user.clubs as ClubPilot[]).map(cp => ({
        ...cp.club,
        role: cp.role
      }))
    }

    return NextResponse.json(transformedUser)

  } catch (error) {
    console.error('Error fetching user:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
} 