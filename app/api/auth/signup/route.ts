import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import { z } from 'zod'

// Validation schema for signup request
const signupSchema = z.object({
  firstname: z.string().min(2, 'First name must be at least 2 characters'),
  lastname: z.string().min(2, 'Last name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  phone: z.string().optional(),
  dsvu_id: z.string().optional(),
})

export async function POST(request: Request) {
  try {
    const body = await request.json()
    
    // Validate request body
    const validatedData = signupSchema.parse(body)
    
    // Check if pilot already exists
    const existingPilot = await prisma.pilot.findUnique({
      where: { email: validatedData.email }
    })

    if (existingPilot) {
      return NextResponse.json(
        { error: 'Pilot with this email already exists' },
        { status: 400 }
      )
    }

    // Hash password
    const salt = await bcrypt.genSalt(10)
    const hashedPassword = await bcrypt.hash(validatedData.password, salt)

    // Create new pilot
    const pilot = await prisma.pilot.create({
      data: {
        ...validatedData,
        password: hashedPassword,
        status: 'PENDING',
        membership: 'BASIC',
        is_admin: false,
      },
      select: {
        id: true,
        firstname: true,
        lastname: true,
        email: true,
        status: true,
        membership: true,
        createdAt: true,
      }
    })

    return NextResponse.json(
      { 
        message: 'Pilot created successfully',
        pilot 
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

    console.error('Signup error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
} 