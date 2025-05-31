import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

// Validation schema for club creation
const createClubSchema = z.object({
  name: z.string().min(1, 'Club name is required'),
  street: z.string().min(1, 'Street is required'),
  zip: z.string().min(1, 'ZIP code is required'),
  city: z.string().min(1, 'City is required'),
  country: z.string().min(1, 'Country is required'),
  vat: z.string().optional(),
  website: z.string().url().optional().or(z.literal('')),
  email: z.string().email().optional().or(z.literal('')),
  contactName: z.string().optional(),
  contactPhone: z.string().optional(),
  club_pin: z.number().int().min(0).default(0),
  homefield: z.string().optional(),
})

export async function POST(request: Request) {
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
    const validatedData = createClubSchema.parse(body)

    // Create the club
    const club = await prisma.club.create({
      data: {
        ...validatedData,
        createdById: userId,
      },
      select: {
        id: true,
        name: true,
        street: true,
        zip: true,
        city: true,
        country: true,
        vat: true,
        website: true,
        email: true,
        contactName: true,
        contactPhone: true,
        club_pin: true,
        homefield: true,
        status: true,
      }
    })

    return NextResponse.json(
      { 
        message: 'Club created successfully',
        club
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

    console.error('Create club error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
} 