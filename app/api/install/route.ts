import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { z } from 'zod';

/**
 * Installation request schema
 */
const installationSchema = z.object({
  club: z.object({
    name: z.string().min(1, 'Club name is required'),
    street: z.string().min(1, 'Street is required'),
    zip: z.string().min(1, 'ZIP code is required'),
    city: z.string().min(1, 'City is required'),
    country: z.string().min(1, 'Country is required'),
    website: z.string().optional(),
    email: z.string().email().optional().or(z.literal('')),
    contactName: z.string().optional(),
    contactPhone: z.string().optional(),
    club_pin: z.string().regex(/^\d{4}$/, 'Club PIN must be exactly 4 digits').optional().or(z.literal('')),
    homefield: z.string().min(1, 'Homefield ICAO code is required').max(4, 'Homefield must be 4 characters')
  }),
  pilot: z.object({
    firstname: z.string().min(1, 'First name is required'),
    lastname: z.string().min(1, 'Last name is required'),
    email: z.string().email('Valid email is required'),
    password: z.string().min(6, 'Password must be at least 6 characters'),
    phone: z.string().optional()
  }),
  planes: z.array(z.object({
    registration_id: z.string().min(1, 'Registration ID is required'),
    type: z.string().min(1, 'Plane type is required'),
    is_twoseater: z.boolean().default(false),
    flarm_id: z.string().optional(),
    competition_id: z.string().optional(),
    year_produced: z.number().optional(),
    notes: z.string().optional()
  })).min(1, 'At least one plane is required')
});

interface ApiResponse {
  success: boolean;
  error?: string;
  needsInstall?: boolean;
  data?: any;
}

// GET handler to check if installation is needed
export async function GET(): Promise<NextResponse<ApiResponse>> {
  try {
    // Check if any clubs exist
    const clubCount = await prisma.club.count();
    
    // Check if any pilots exist
    const pilotCount = await prisma.pilot.count();
    
    // Installation is needed if there are no clubs OR no pilots
    const needsInstall = clubCount === 0 || pilotCount === 0;
    
    return NextResponse.json<ApiResponse>({
      success: true,
      needsInstall
    });
  } catch (error: unknown) {
    console.error('Error checking installation status:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return NextResponse.json<ApiResponse>(
      { success: false, error: `Failed to check installation status: ${errorMessage}` },
      { status: 500 }
    );
  }
}

// POST handler to perform installation
export async function POST(request: NextRequest): Promise<NextResponse<ApiResponse>> {
  try {
    // Parse and validate request body
    const body = await request.json();
    
    const validation = installationSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json<ApiResponse>(
        { 
          success: false, 
          error: 'Validation failed: ' + validation.error.errors.map(e => e.message).join(', ')
        },
        { status: 400 }
      );
    }

    const { club: clubData, pilot: pilotData, planes: planesData } = validation.data;

    // Check if installation is still needed
    const clubCount = await prisma.club.count();
    const pilotCount = await prisma.pilot.count();
    
    if (clubCount > 0 && pilotCount > 0) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: 'Installation is no longer needed - system is already set up' },
        { status: 400 }
      );
    }

    // Check if pilot email already exists
    const existingPilot = await prisma.pilot.findUnique({
      where: { email: pilotData.email }
    });

    if (existingPilot) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: 'A pilot with this email already exists' },
        { status: 400 }
      );
    }

    // Check if any plane registration already exists
    for (const plane of planesData) {
      const existingPlane = await prisma.plane.findUnique({
        where: { registration_id: plane.registration_id }
      });
      
      if (existingPlane) {
        return NextResponse.json<ApiResponse>(
          { success: false, error: `Plane with registration ${plane.registration_id} already exists` },
          { status: 400 }
        );
      }
    }

    // Start transaction to create everything atomically
    const result = await prisma.$transaction(async (tx) => {
      // 1. Hash the pilot password
      const hashedPassword = await bcrypt.hash(pilotData.password, 12);

      // 2. Create the pilot first
      const pilot = await tx.pilot.create({
        data: {
          firstname: pilotData.firstname,
          lastname: pilotData.lastname,
          email: pilotData.email,
          password: hashedPassword,
          phone: pilotData.phone || undefined,
          status: 'ACTIVE',
          membership: 'PREMIUM',
          is_admin: true
        }
      });

      // 3. Create the club
      const club = await tx.club.create({
        data: {
          name: clubData.name,
          street: clubData.street,
          zip: clubData.zip,
          city: clubData.city,
          country: clubData.country,
          website: clubData.website || undefined,
          email: clubData.email || undefined,
          contactName: clubData.contactName || undefined,
          contactPhone: clubData.contactPhone || undefined,
          club_pin: clubData.club_pin ? parseInt(clubData.club_pin, 10) : undefined,
          homefield: clubData.homefield,
          createdById: pilot.id
        }
      });

      // 4. Assign pilot as admin of the club
      await tx.clubPilot.create({
        data: {
          pilotId: pilot.id,
          clubId: club.id,
          role: 'ADMIN'
        }
      });

      // 5. Create planes
      const planes = await Promise.all(
        planesData.map(plane => 
          tx.plane.create({
            data: {
              registration_id: plane.registration_id,
              type: plane.type,
              is_twoseater: plane.is_twoseater,
              is_guest: false,
              flarm_id: plane.flarm_id || undefined,
              competition_id: plane.competition_id || undefined,
              year_produced: plane.year_produced || undefined,
              notes: plane.notes || undefined,
              clubId: club.id,
              createdById: pilot.id
            }
          })
        )
      );

      return {
        pilot,
        club,
        planes
      };
    });

    return NextResponse.json<ApiResponse>({
      success: true,
      data: {
        message: 'Installation completed successfully',
        club: {
          id: result.club.id,
          name: result.club.name
        },
        pilot: {
          id: result.pilot.id,
          name: `${result.pilot.firstname} ${result.pilot.lastname}`,
          email: result.pilot.email
        },
        planesCreated: result.planes.length
      }
    });

  } catch (error: any) {
    console.error('Installation error:', error);
    
    // Handle specific Prisma errors
    if (error.code === 'P2002') {
      return NextResponse.json<ApiResponse>(
        { success: false, error: 'A record with this unique field already exists' },
        { status: 400 }
      );
    }
    
    return NextResponse.json<ApiResponse>(
      { success: false, error: 'Installation failed: ' + error.message },
      { status: 500 }
    );
  }
} 