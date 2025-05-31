import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { ClubRole, PilotMembership, PilotStatus } from '@prisma/client'

// Validation schema for pilot creation
const createPilotSchema = z.object({
  firstname: z.string().min(1, 'First name is required'),
  lastname: z.string().min(1, 'Last name is required'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  phone: z.string().optional(),
  dsvu_id: z.string().optional(),
  clubId: z.string().min(1, 'Club ID is required'),
  membership: z.nativeEnum(PilotMembership, {
    errorMap: () => ({ message: 'Invalid membership type. Must be BASIC, PREMIUM, or VIP' })
  }).default('BASIC'),
  status: z.nativeEnum(PilotStatus, {
    errorMap: () => ({ message: 'Invalid status. Must be ACTIVE, INACTIVE, or PENDING' })
  }).default('PENDING'),
  role: z.nativeEnum(ClubRole, {
    errorMap: () => ({ message: 'Invalid role. Must be USER or ADMIN' })
  }).default('USER')
})

export async function POST(request: Request) {
  try {
    // Get user ID from headers (set by middleware)
    const userId = request.headers.get('x-user-id')
    
    // Parse and validate request body
    const body = await request.json()
    const validatedData = createPilotSchema.parse(body)

    // Check if club exists
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

    // Check if email is already taken
    const existingPilot = await prisma.pilot.findUnique({
      where: { email: validatedData.email }
    })

    if (existingPilot) {
      return NextResponse.json(
        { error: 'Email already registered' },
        { status: 400 }
      )
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(validatedData.password, 10)

    // Create the pilot and assign to club in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Create the pilot
      const pilot = await tx.pilot.create({
        data: {
          firstname: validatedData.firstname,
          lastname: validatedData.lastname,
          email: validatedData.email,
          password: hashedPassword,
          phone: validatedData.phone,
          dsvu_id: validatedData.dsvu_id,
          status: validatedData.status,
          membership: validatedData.membership,
          is_admin: false
        }
      })

      // Assign the pilot to the club
      const clubPilot = await tx.clubPilot.create({
        data: {
          pilotId: pilot.id,
          clubId: validatedData.clubId,
          role: validatedData.role
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
          },
          club: {
            select: {
              id: true,
              name: true
            }
          }
        }
      })

      return clubPilot
    })

    return NextResponse.json(
      { 
        message: 'Pilot created and assigned to club successfully',
        clubPilot: result
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

    console.error('Create pilot error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
} 