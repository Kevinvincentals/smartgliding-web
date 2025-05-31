import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    const clubs = await prisma.club.findMany({
      select: {
        id: true,
        name: true,
        homefield: true, // Also fetching homefield as it might be useful for display or initial context
        club_pin: false, // Explicitly exclude PIN
      },
      orderBy: {
        name: 'asc',
      },
    })

    if (!clubs || clubs.length === 0) {
      return NextResponse.json({ error: 'No clubs found' }, { status: 404 })
    }

    return NextResponse.json(clubs)
  } catch (error) {
    console.error('Error fetching clubs:', error)
    return NextResponse.json(
      { error: 'Internal server error fetching clubs' },
      { status: 500 },
    )
  }
} 