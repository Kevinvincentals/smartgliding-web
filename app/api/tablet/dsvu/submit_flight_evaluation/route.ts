import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { JWTPayload } from '@/lib/jwt';
import type { ApiResponse } from '@/types/tablet-api';
import { z } from 'zod';

/**
 * Flight evaluation submission schema
 */
const flightEvaluationSchema = z.object({
  flightId: z.string(),
  pilotId: z.string(),
  instructorPin: z.number().int().min(1000).max(9999), // 4-digit PIN
  evaluations: z.array(z.object({
    exerciseId: z.string(),
    moduleId: z.string(),
    grade: z.number().int().min(1).max(3) // 1, 2, or 3
  })),
  notes: z.string().optional()
});

/**
 * API response for flight evaluation endpoint
 */
interface FlightEvaluationApiResponse extends ApiResponse {
  message?: string
}

// POST handler to submit flight evaluations
export async function POST(request: NextRequest): Promise<NextResponse<FlightEvaluationApiResponse>> {
  try {
    const body = await request.json();
    
    // Validate request body
    const validation = flightEvaluationSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json<FlightEvaluationApiResponse>(
        { 
          success: false, 
          error: 'Invalid request data: ' + validation.error.errors.map(e => e.message).join(', ')
        },
        { status: 400 }
      );
    }

    const { flightId, pilotId, instructorPin, evaluations, notes } = validation.data;

    const jwtPayloadString = request.headers.get('x-jwt-payload');
    if (!jwtPayloadString) {
      return NextResponse.json<FlightEvaluationApiResponse>(
        { success: false, error: 'Authentication token not found.' }, 
        { status: 401 }
      );
    }
    
    const jwtPayload: JWTPayload = JSON.parse(jwtPayloadString);
    const clubId = jwtPayload.clubId || jwtPayload.id;
    const instructorId = jwtPayload.pilotId || jwtPayload.id;

    if (!clubId) {
      return NextResponse.json<FlightEvaluationApiResponse>(
        { success: false, error: 'Club ID not found in authentication token.' }, 
        { status: 401 }
      );
    }

    if (!instructorId) {
      return NextResponse.json<FlightEvaluationApiResponse>(
        { success: false, error: 'Instructor ID not found in authentication token.' }, 
        { status: 401 }
      );
    }

    // Ensure instructorId is a string
    if (typeof instructorId !== 'string') {
      return NextResponse.json<FlightEvaluationApiResponse>(
        { success: false, error: 'Invalid instructor ID format.' }, 
        { status: 401 }
      );
    }

    // Verify instructor PIN
    const club = await prisma.club.findUnique({
      where: { id: clubId },
      select: { instructor_pin: true }
    });

    if (!club) {
      return NextResponse.json<FlightEvaluationApiResponse>(
        { success: false, error: 'Club not found.' }, 
        { status: 404 }
      );
    }

    if (club.instructor_pin !== instructorPin) {
      return NextResponse.json<FlightEvaluationApiResponse>(
        { success: false, error: 'Forkert instruktør PIN.' }, 
        { status: 403 }
      );
    }

    // Verify the flight exists and is a school flight
    const flight = await prisma.flightLogbook.findUnique({
      where: { id: flightId },
      select: { 
        id: true, 
        is_school_flight: true, 
        pilot1Id: true,
        clubId: true
      }
    });

    if (!flight) {
      return NextResponse.json<FlightEvaluationApiResponse>(
        { success: false, error: 'Flight not found.' }, 
        { status: 404 }
      );
    }

    if (!flight.is_school_flight) {
      return NextResponse.json<FlightEvaluationApiResponse>(
        { success: false, error: 'This is not a school flight.' }, 
        { status: 400 }
      );
    }

    if (flight.pilot1Id !== pilotId) {
      return NextResponse.json<FlightEvaluationApiResponse>(
        { success: false, error: 'Pilot ID does not match flight pilot.' }, 
        { status: 400 }
      );
    }

    if (flight.clubId !== clubId) {
      return NextResponse.json<FlightEvaluationApiResponse>(
        { success: false, error: 'Flight does not belong to this club.' }, 
        { status: 400 }
      );
    }

    // Process evaluations in a transaction
    await prisma.$transaction(async (tx) => {
      for (const evaluation of evaluations) {
        // Create or update flight evaluation
        await tx.dkDsvuFlightEvaluation.upsert({
          where: {
            flightId_pilotId_exerciseId: {
              flightId,
              pilotId,
              exerciseId: evaluation.exerciseId
            }
          },
          update: {
            grade: evaluation.grade,
            evaluatedById: instructorId,
            ...(notes && { notes: notes }), // Only update notes if provided
            updatedAt: new Date()
          },
          create: {
            flightId,
            pilotId,
            exerciseId: evaluation.exerciseId,
            moduleId: evaluation.moduleId,
            grade: evaluation.grade,
            evaluatedById: instructorId,
            notes: notes || null
          }
        });
      }
    });
    
    return NextResponse.json<FlightEvaluationApiResponse>({
      success: true,
      message: 'Flight evaluations submitted successfully'
    });
  } catch (error: unknown) {
    console.error('Error submitting flight evaluations:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return NextResponse.json<FlightEvaluationApiResponse>(
      { success: false, error: `Failed to submit evaluations: ${errorMessage}` },
      { status: 500 }
    );
  }
} 