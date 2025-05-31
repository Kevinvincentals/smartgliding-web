import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import type { ApiResponse, JWTPayload } from '@/types/tablet-api';

/**
 * DSVU School catalog response
 */
interface DsvuSchoolApiResponse extends ApiResponse {
  modules?: Array<{
    id: string
    moduleId: string
    titel: string
    exercises: Array<{
      id: string
      text: string
      order: number
    }>
  }>
  requirements?: {
    minimum_starter: number
    minimum_flyvetimer: number
    minimum_to_sædet_skoling: number
    minimum_solo_flyvning: number
  }
}

export async function GET(request: NextRequest): Promise<NextResponse<DsvuSchoolApiResponse>> {
  try {
    const jwtPayloadString = request.headers.get('x-jwt-payload');
    if (!jwtPayloadString) {
      return NextResponse.json<DsvuSchoolApiResponse>(
        { success: false, error: 'Authentication token not found.' }, 
        { status: 401 }
      );
    }

    const jwtPayload: JWTPayload = JSON.parse(jwtPayloadString);
    
    console.log(`Fetching DSVU school catalog`);

    // Fetch all modules with exercises
    const modules = await (prisma as any).dkDsvuSchoolCatalog.findMany();

    // Sort modules properly by extracting the number part
    const sortedModules = modules.sort((a: any, b: any) => {
      // Extract prefix (G or U) and number
      const aMatch = a.moduleId.match(/^([GU])-(\d+)$/);
      const bMatch = b.moduleId.match(/^([GU])-(\d+)$/);
      
      if (!aMatch || !bMatch) {
        // Fallback to alphabetical if pattern doesn't match
        return a.moduleId.localeCompare(b.moduleId);
      }
      
      const [, aPrefix, aNumber] = aMatch;
      const [, bPrefix, bNumber] = bMatch;
      
      // First sort by prefix (G before U)
      if (aPrefix !== bPrefix) {
        return aPrefix.localeCompare(bPrefix);
      }
      
      // Then sort by number (1, 2, 3... not 1, 10, 11...)
      return parseInt(aNumber) - parseInt(bNumber);
    });

    // Fetch requirements
    const requirements = await (prisma as any).dkDsvuSchoolRequirements.findFirst();

    // Transform the data to ensure proper typing
    const transformedModules = sortedModules.map((module: any) => ({
      id: module.id,
      moduleId: module.moduleId,
      titel: module.titel,
      exercises: Array.isArray(module.exercises) 
        ? (module.exercises as any[]).map((exercise: any) => ({
            id: exercise.id || '',
            text: exercise.text || '',
            order: exercise.order || 0
          }))
        : []
    }));

    const transformedRequirements = requirements ? {
      minimum_starter: requirements.minimum_starter,
      minimum_flyvetimer: requirements.minimum_flyvetimer,
      minimum_to_sædet_skoling: requirements.minimum_to_sædet_skoling,
      minimum_solo_flyvning: requirements.minimum_solo_flyvning
    } : undefined;

    return NextResponse.json<DsvuSchoolApiResponse>({
      success: true,
      modules: transformedModules,
      requirements: transformedRequirements
    });
  } catch (error: unknown) {
    console.error('Error fetching DSVU school catalog:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return NextResponse.json<DsvuSchoolApiResponse>(
      { success: false, error: `Failed to fetch DSVU school catalog: ${errorMessage}` },
      { status: 500 }
    );
  }
} 