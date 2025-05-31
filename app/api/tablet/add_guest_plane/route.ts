import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { addGuestPlaneRequestSchema, validateRequestBody } from '@/lib/validations/tablet-api';
import type { ApiResponse } from '@/types/tablet-api';
import { JWTPayload } from '@/lib/jwt';

/**
 * Guest plane creation response
 */
interface AddGuestPlaneResponse extends ApiResponse {
  plane?: {
    id: string
    registration: string
    type: string
    isDoubleSeater: boolean
    competitionId?: string | null
    hasFlarm: boolean
    isGuest: boolean
  }
  message?: string
}

export async function POST(request: NextRequest): Promise<NextResponse<AddGuestPlaneResponse>> {
  try {
    // Parse and validate request body
    const body = await request.json();
    console.log('Request data:', body);
    
    // Validate request body with Zod
    const validation = validateRequestBody(addGuestPlaneRequestSchema, body);
    if (!validation.success) {
      return NextResponse.json<AddGuestPlaneResponse>(
        { 
          success: false, 
          error: validation.error,
          ...(validation.details && { details: validation.details.join(', ') })
        },
        { status: 400 }
      );
    }

    const data = validation.data;
    
    // Extract clubId from JWT token
    const jwtPayloadString = request.headers.get('x-jwt-payload');
    if (!jwtPayloadString) {
      return NextResponse.json<AddGuestPlaneResponse>(
        { success: false, error: 'Authentication token not found.' }, 
        { status: 401 }
      );
    }
    
    const jwtPayload: JWTPayload = JSON.parse(jwtPayloadString);
    const clubId = jwtPayload.clubId || jwtPayload.id;

    if (!clubId) {
      return NextResponse.json<AddGuestPlaneResponse>(
        { success: false, error: 'Club ID not found in authentication token.' }, 
        { status: 401 }
      );
    }
    
    const { 
      registration, 
      competitionId, 
      model, 
      isTwoSeater,
      flarmId
    } = data;
    
    // Set hasFlarm based on flarmId presence (fix for flarmId being null issue)
    const hasFlarm = !!(flarmId && flarmId.trim());

    // Get additional data from request body (not validated by schema)
    const { createdById } = body;

    console.log('Using clubId from JWT:', clubId);

    // Check if the plane already exists in the database
    console.log('Looking for existing plane with registration:', registration);
    const existingPlane = await prisma.plane.findUnique({
      where: {
        registration_id: registration
      }
    });

    if (existingPlane) {
      console.log('Found existing plane:', existingPlane);
      // Convert the plane to the format expected by the client
      return NextResponse.json<AddGuestPlaneResponse>({
        success: true,
        plane: {
          id: existingPlane.id,
          registration: existingPlane.registration_id,
          type: existingPlane.type,
          isDoubleSeater: existingPlane.is_twoseater,
          competitionId: existingPlane.competition_id,
          hasFlarm: !!existingPlane.flarm_id,
          isGuest: !!existingPlane.is_guest
        },
        message: 'Plane already exists in the database'
      });
    }

    // Use system user (first admin) if not specified
    let finalCreatedById;
    if (!createdById) {
      console.log('No createdById provided, looking for an admin user');
      const adminUser = await prisma.pilot.findFirst({
        where: {
          is_admin: true
        },
        select: {
          id: true
        }
      });
      
      if (!adminUser) {
        console.log('No admin user found');
        return NextResponse.json<AddGuestPlaneResponse>({
          success: false,
          error: 'No admin user found to associate with this plane'
        }, { status: 400 });
      }
      
      finalCreatedById = adminUser.id;
      console.log('Using admin user ID:', finalCreatedById);
    } else {
      finalCreatedById = createdById;
      console.log('Using provided createdById:', finalCreatedById);
    }

    // Create the guest plane
    console.log('Creating new plane with data:', {
      registration_id: registration,
      flarm_id: hasFlarm ? flarmId : null,
      competition_id: competitionId,
      type: model,
      is_twoseater: isTwoSeater,
      is_guest: true,
      clubId: clubId,
      createdById: finalCreatedById
    });
    
    const newPlane = await prisma.plane.create({
      data: {
        registration_id: registration,
        flarm_id: hasFlarm ? flarmId : null,
        competition_id: competitionId || null,
        type: model,
        is_twoseater: isTwoSeater,
        is_guest: true,
        notes: 'Added from OGN database',
        club: {
          connect: {
            id: clubId
          }
        },
        createdBy: {
          connect: {
            id: finalCreatedById
          }
        }
      }
    });

    console.log('Successfully created plane:', newPlane);
    return NextResponse.json<AddGuestPlaneResponse>({
      success: true,
      plane: {
        id: newPlane.id,
        registration: newPlane.registration_id,
        type: newPlane.type,
        isDoubleSeater: newPlane.is_twoseater,
        competitionId: newPlane.competition_id,
        hasFlarm: !!newPlane.flarm_id,
        isGuest: newPlane.is_guest
      }
    });
    
  } catch (error: unknown) {
    console.error('Error adding guest plane:', error);
    return NextResponse.json<AddGuestPlaneResponse>({
      success: false,
      error: 'Failed to add guest plane: ' + (error instanceof Error ? error.message : String(error))
    }, { status: 500 });
  }
} 