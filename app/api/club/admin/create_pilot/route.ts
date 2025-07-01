import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

// Validation schema for pilot creation
const createPilotSchema = z.object({
  firstname: z.string().min(1, 'First name is required'),
  lastname: z.string().min(1, 'Last name is required'),
  email: z.string().refine(val => val === '' || val === null || z.string().email().safeParse(val).success, {
    message: 'Must be a valid email or empty'
  }).nullable().optional(),
  phone: z.string().nullable().optional(),
  dsvu_id: z.string().nullable().optional(),
  membership: z.enum(['A', 'B', 'C', 'BASIC', 'PREMIUM', 'VIP']).default('A'),
  status: z.enum(['ACTIVE', 'INACTIVE', 'PENDING']).default('ACTIVE'),
  role: z.enum(['USER', 'ADMIN']).default('USER'),
  personal_pin: z.string().length(4).regex(/^\d{4}$/).nullable().optional()
})

export async function POST(request: Request) {
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
    
    // Parse and validate request body
    const body = await request.json()
    const validatedData = createPilotSchema.parse(body)

    // Check if club exists and is active
    const club = await prisma.club.findUnique({
      where: { 
        id: clubId,
        status: 'active'
      }
    })

    if (!club) {
      return NextResponse.json(
        { error: 'Club not found or not active' },
        { status: 404 }
      )
    }

    // Check if email is already taken (only if email is provided)
    if (validatedData.email) {
      const existingPilot = await prisma.pilot.findFirst({
        where: { email: validatedData.email }
      })

      if (existingPilot) {
        return NextResponse.json(
          { error: 'Email already registered' },
          { status: 400 }
        )
      }
    }

    // Create the pilot and assign to club in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Prepare pilot data (only include fields that have values)
      const pilotData: any = {
        firstname: validatedData.firstname,
        lastname: validatedData.lastname,
        status: validatedData.status,
        membership: validatedData.membership,
        is_admin: false
      }

      // Handle email - if no email provided, generate a unique placeholder to avoid constraint issues
      if (validatedData.email && validatedData.email.trim() !== '') {
        pilotData.email = validatedData.email
      } else {
        // Generate a unique placeholder email to work around MongoDB unique constraint
        pilotData.email = `noemail_${Date.now()}_${Math.random().toString(36).substr(2, 9)}@placeholder.local`
      }

      // Only include optional fields if they have values
      if (validatedData.phone) pilotData.phone = validatedData.phone
      if (validatedData.dsvu_id) pilotData.dsvu_id = validatedData.dsvu_id
      if (validatedData.personal_pin) pilotData.personal_pin = validatedData.personal_pin

      // Create the pilot
      const pilot = await tx.pilot.create({
        data: pilotData
      })

      // Assign the pilot to the club
      const clubPilot = await tx.clubPilot.create({
        data: {
          pilotId: pilot.id,
          clubId: clubId,
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
        { error: error.errors[0].message },
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