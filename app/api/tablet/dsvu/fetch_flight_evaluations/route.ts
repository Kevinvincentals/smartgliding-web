import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { JWTPayload } from '@/lib/jwt';
import type { ApiResponse } from '@/types/tablet-api';

/**
 * API response for flight evaluations
 */
interface FlightEvaluationsApiResponse extends ApiResponse {
  evaluations?: {
    exerciseId: string
    moduleId: string
    grade: number
    notes?: string | null
    evaluatedBy?: string
    evaluatedAt: Date
  }[]
}

// GET handler to fetch flight evaluations
export async function GET(request: NextRequest): Promise<NextResponse<FlightEvaluationsApiResponse>> {
  try {
    const { searchParams } = new URL(request.url);
    const flightId = searchParams.get('flightId');
    const pilotId = searchParams.get('pilotId');

    if (!flightId || !pilotId) {
      return NextResponse.json<FlightEvaluationsApiResponse>(
        { success: false, error: 'Flight ID and Pilot ID are required.' },
        { status: 400 }
      );
    }

    const jwtPayloadString = request.headers.get('x-jwt-payload');
    if (!jwtPayloadString) {
      return NextResponse.json<FlightEvaluationsApiResponse>(
        { success: false, error: 'Authentication token not found.' }, 
        { status: 401 }
      );
    }
    
    const jwtPayload: JWTPayload = JSON.parse(jwtPayloadString);
    const clubId = jwtPayload.clubId || jwtPayload.id;

    if (!clubId) {
      return NextResponse.json<FlightEvaluationsApiResponse>(
        { success: false, error: 'Club ID not found in authentication token.' }, 
        { status: 401 }
      );
    }

    // Verify the flight belongs to this club
    const flight = await prisma.flightLogbook.findUnique({
      where: { id: flightId },
      select: { clubId: true }
    });

    if (!flight || flight.clubId !== clubId) {
      return NextResponse.json<FlightEvaluationsApiResponse>(
        { success: false, error: 'Flight not found or access denied.' }, 
        { status: 404 }
      );
    }

    // Fetch evaluations for this flight and pilot
    const evaluations = await prisma.dkDsvuFlightEvaluation.findMany({
      where: {
        flightId,
        pilotId
      },
      include: {
        evaluatedBy: {
          select: {
            firstname: true,
            lastname: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    const formattedEvaluations = evaluations.map(evaluation => ({
      exerciseId: evaluation.exerciseId,
      moduleId: evaluation.moduleId,
      grade: evaluation.grade,
      notes: evaluation.notes,
      evaluatedBy: evaluation.evaluatedBy ? `${evaluation.evaluatedBy.firstname} ${evaluation.evaluatedBy.lastname}` : undefined,
      evaluatedAt: evaluation.createdAt
    }));
    
    return NextResponse.json<FlightEvaluationsApiResponse>({
      success: true,
      evaluations: formattedEvaluations
    });
  } catch (error: unknown) {
    console.error('Error fetching flight evaluations:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return NextResponse.json<FlightEvaluationsApiResponse>(
      { success: false, error: `Failed to fetch evaluations: ${errorMessage}` },
      { status: 500 }
    );
  }
} 