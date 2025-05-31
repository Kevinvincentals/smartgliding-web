import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { generateTokens } from '@/lib/jwt'

// Validation schema for signin request
const signinSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
})

export async function POST(request: Request) {
  try {
    const body = await request.json()
    
    // Validate request body
    const validatedData = signinSchema.parse(body)
    
    // Find pilot by email
    const pilot = await prisma.pilot.findUnique({
      where: { email: validatedData.email },
      select: {
        id: true,
        email: true,
        password: true,
        status: true,
        is_admin: true,
        clubs: {
          select: {
            role: true,
            club: {
              select: {
                id: true,
                name: true
              }
            }
          }
        }
      }
    })

    if (!pilot) {
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      )
    }

    // Check if pilot is active
    if (pilot.status !== 'ACTIVE') {
      return NextResponse.json(
        { error: 'Account is not active' },
        { status: 401 }
      )
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(
      validatedData.password,
      pilot.password
    )

    if (!isValidPassword) {
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      )
    }

    // Format club memberships for JWT
    const clubMemberships = pilot.clubs.map(membership => ({
      clubId: membership.club.id,
      clubName: membership.club.name,
      role: membership.role
    }))

    // Generate tokens with club memberships
    const tokens = await generateTokens({
      id: pilot.id,
      email: pilot.email,
      is_admin: pilot.is_admin,
      clubs: clubMemberships
    })

    // Return response with tokens and user info
    return NextResponse.json(
      { 
        message: 'Sign in successful',
        pilot: {
          id: pilot.id,
          email: pilot.email,
          is_admin: pilot.is_admin,
          clubs: clubMemberships
        },
        tokens: {
          access_token: tokens.accessToken,
          refresh_token: tokens.refreshToken,
        }
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

    console.error('Signin error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
} 