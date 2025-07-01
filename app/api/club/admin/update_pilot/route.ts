import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

// Validation schema for pilot update (allow partial updates)
const updatePilotSchema = z.object({
  pilotId: z.string().min(1, 'Pilot ID is required'),
  firstname: z.string().min(1, 'First name is required').optional(),
  lastname: z.string().min(1, 'Last name is required').optional(),
  email: z.string().refine(val => val === '' || z.string().email().safeParse(val).success, {
    message: 'Must be a valid email or empty'
  }).optional(),
  phone: z.string().nullable().optional(),
  dsvu_id: z.string().nullable().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'PENDING']).optional(),
  membership: z.enum(['A', 'B', 'C', 'BASIC', 'PREMIUM', 'VIP']).optional(),
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

    const body = await request.json()
    const validatedData = updatePilotSchema.parse(body)

    // Verify that the pilot is assigned to this club
    const clubPilot = await prisma.clubPilot.findFirst({
      where: {
        pilotId: validatedData.pilotId,
        clubId: clubId
      }
    })

    if (!clubPilot) {
      return NextResponse.json(
        { error: 'Pilot not found in this club' },
        { status: 404 }
      )
    }

    // Prepare update data (only include fields that are provided)
    const updateData: any = {}
    
    if (validatedData.firstname !== undefined) updateData.firstname = validatedData.firstname
    if (validatedData.lastname !== undefined) updateData.lastname = validatedData.lastname
    if (validatedData.email !== undefined) updateData.email = validatedData.email === '' ? null : validatedData.email
    if (validatedData.phone !== undefined) updateData.phone = validatedData.phone === '' || validatedData.phone === null ? null : validatedData.phone
    if (validatedData.dsvu_id !== undefined) updateData.dsvu_id = validatedData.dsvu_id === '' || validatedData.dsvu_id === null ? null : validatedData.dsvu_id
    if (validatedData.status !== undefined) updateData.status = validatedData.status
    if (validatedData.membership !== undefined) updateData.membership = validatedData.membership

    // Only update PIN if provided
    if (validatedData.personal_pin) {
      updateData.personal_pin = validatedData.personal_pin
    }

    // Update pilot information
    const updatedPilot = await prisma.pilot.update({
      where: {
        id: validatedData.pilotId
      },
      data: updateData,
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
    })

    return NextResponse.json(
      { 
        message: 'Pilot updated successfully',
        pilot: updatedPilot
      },
      { status: 200 }
    )

  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.errors[0].message },
        { status: 400 }
      )
    }

    console.error('Update pilot error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}