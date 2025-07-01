import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(request: Request) {
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

    // Get search query from URL params
    const url = new URL(request.url)
    const query = url.searchParams.get('query')

    if (!query || query.trim() === '') {
      return NextResponse.json(
        { error: 'Search query is required' },
        { status: 400 }
      )
    }

    const searchTerms = query.trim().toLowerCase().split(' ')

    // Search for pilots not already in this club
    const pilots = await prisma.pilot.findMany({
      where: {
        AND: [
          {
            OR: searchTerms.map(term => ({
              OR: [
                {
                  firstname: {
                    contains: term,
                    mode: 'insensitive'
                  }
                },
                {
                  lastname: {
                    contains: term,
                    mode: 'insensitive'
                  }
                }
              ]
            }))
          },
          {
            NOT: {
              clubs: {
                some: {
                  clubId: clubId
                }
              }
            }
          }
        ]
      },
      select: {
        id: true,
        firstname: true,
        lastname: true,
        email: true,
        phone: true,
        dsvu_id: true,
        status: true,
        membership: true
      },
      take: 10 // Limit results to 10
    })

    return NextResponse.json(
      { 
        message: 'Pilots searched successfully',
        pilots
      },
      { status: 200 }
    )

  } catch (error) {
    console.error('Search pilots error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}