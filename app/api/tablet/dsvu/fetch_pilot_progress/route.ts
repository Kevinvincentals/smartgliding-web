import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { JWTPayload } from '@/lib/jwt';
import type { ApiResponse } from '@/types/tablet-api';

/**
 * API response for pilot progress
 */
interface PilotProgressApiResponse extends ApiResponse {
  progress?: {
    exerciseId: string
    moduleId: string
    bestGrade: number
    evaluationCount: number
    lastEvaluatedAt: Date
    evaluatedBy?: string
  }[]
}

// GET handler to fetch pilot progress (calculated from flight evaluations)
export async function GET(request: NextRequest): Promise<NextResponse<PilotProgressApiResponse>> {
  try {
    const { searchParams } = new URL(request.url);
    const pilotId = searchParams.get('pilotId');

    if (!pilotId) {
      return NextResponse.json<PilotProgressApiResponse>(
        { success: false, error: 'Pilot ID is required.' },
        { status: 400 }
      );
    }

    const jwtPayloadString = request.headers.get('x-jwt-payload');
    if (!jwtPayloadString) {
      return NextResponse.json<PilotProgressApiResponse>(
        { success: false, error: 'Authentication token not found.' }, 
        { status: 401 }
      );
    }
    
    const jwtPayload: JWTPayload = JSON.parse(jwtPayloadString);
    const clubId = jwtPayload.clubId || jwtPayload.id;

    if (!clubId) {
      return NextResponse.json<PilotProgressApiResponse>(
        { success: false, error: 'Club ID not found in authentication token.' }, 
        { status: 401 }
      );
    }

    // Fetch all evaluations for this pilot from flights belonging to this club
    const evaluations = await prisma.dkDsvuFlightEvaluation.findMany({
      where: {
        pilotId,
        flight: {
          clubId
        }
      },
      orderBy: [
        { exerciseId: 'asc' },
        { grade: 'desc' },
        { createdAt: 'desc' }
      ]
    });

    // Calculate best grade per exercise
    const progressMap = new Map<string, {
      exerciseId: string
      moduleId: string
      bestGrade: number
      evaluationCount: number
      lastEvaluatedAt: Date
      evaluatedBy?: string
    }>();

    evaluations.forEach(evaluation => {
      const existing = progressMap.get(evaluation.exerciseId);
      
      if (!existing || evaluation.grade > existing.bestGrade) {
        // Count total evaluations for this exercise
        const evaluationCount = evaluations.filter(e => e.exerciseId === evaluation.exerciseId).length;
        
        progressMap.set(evaluation.exerciseId, {
          exerciseId: evaluation.exerciseId,
          moduleId: evaluation.moduleId,
          bestGrade: evaluation.grade,
          evaluationCount,
          lastEvaluatedAt: evaluation.createdAt,
          evaluatedBy: undefined // Simplified for now
        });
      }
    });

    const progress = Array.from(progressMap.values()).sort((a, b) => a.exerciseId.localeCompare(b.exerciseId));
    
    return NextResponse.json<PilotProgressApiResponse>({
      success: true,
      progress
    });
  } catch (error: unknown) {
    console.error('Error fetching pilot progress:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return NextResponse.json<PilotProgressApiResponse>(
      { success: false, error: `Failed to fetch pilot progress: ${errorMessage}` },
      { status: 500 }
    );
  }
} 