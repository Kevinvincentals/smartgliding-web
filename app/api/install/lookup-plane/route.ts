import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// Remove the CSV-related imports and interface
// Define an interface for our record structure matching the database model
interface OgnRecord {
  deviceType: string;
  deviceId: string;
  aircraftModel: string | null;
  registration: string | null;
  cn: string | null;
  tracked: boolean;
  identified: boolean;
}

/**
 * Plane lookup response for installation
 */
interface PlaneApiResponse {
  success: boolean;
  error?: string;
  plane?: {
    registration_id: string;
    type: string;
    flarm_id?: string;
    competition_id?: string;
    is_twoseater?: boolean;
  };
  suggestions?: Array<{
    registration_id: string;
    type: string;
    flarm_id?: string;
    competition_id?: string;
  }>;
}

// Helper function to determine if a plane type is typically two-seater
const isTwoSeaterType = (model: string): boolean => {
  if (!model) return false;
  
  const twoSeaterKeywords = [
    'ASK 21', 'ASK21', 'ASK-21',
    'DUO DISCUS', 'DUODISCUS', 'DUO-DISCUS',
    'TWIN', 'PUCHACZ', 'BOCIAN',
    'ASK 13', 'ASK13', 'ASK-13',
    'BLANIK', 'L-13', 'L13',
    'GROB 103', 'G103', 'TWIN ASTIR',
    'TWIN III', 'JANUS', 'ARCUS',
    'ASG 32', 'ASG32'
  ];
  
  const modelUpper = model.toUpperCase();
  return twoSeaterKeywords.some(keyword => modelUpper.includes(keyword));
};

export async function GET(request: NextRequest): Promise<NextResponse<PlaneApiResponse>> {
  try {
    const url = new URL(request.url);
    const query = url.searchParams.get('query');
    
    if (!query || query.length < 2) {
      return NextResponse.json<PlaneApiResponse>({
        success: false,
        error: 'Search query must be at least 2 characters long'
      }, { status: 400 });
    }
    
    console.log(`Looking up plane for installation: ${query}`);
    
    // Normalize the query (uppercase, trim, remove hyphens for some comparisons)
    const normalizedQuery = query.trim().toUpperCase();
    const normalizedQueryNoHyphen = normalizedQuery.replace(/-/g, '');
    
    // Query the database instead of reading CSV
    const records = await prisma.ognDatabase.findMany({
      where: {
        OR: [
          {
            registration: {
              contains: normalizedQuery,
              mode: 'insensitive'
            }
          },
          {
            registration: {
              contains: normalizedQueryNoHyphen,
              mode: 'insensitive'
            }
          },
          {
            cn: {
              contains: normalizedQuery,
              mode: 'insensitive'
            }
          },
          {
            cn: {
              contains: normalizedQueryNoHyphen,
              mode: 'insensitive'
            }
          }
        ],
        // Exclude paragliders (P), ultralights (U), and balloons (B)
        deviceType: {
          notIn: ['P', 'U', 'B']
        }
      },
      take: 50 // Limit results
    });
    
    // Helper function to check if a registration matches the search query
    const isRegistrationMatch = (registration: string | null, query: string, queryNoHyphen: string): boolean => {
      if (!registration) return false;
      
      const regUpper = registration.toUpperCase();
      const regNoHyphen = regUpper.replace(/-/g, '');
      
      // Exact match with or without hyphen
      if (regUpper === query || regNoHyphen === queryNoHyphen) return true;
      
      // Partial match
      if (regUpper.includes(query) || regNoHyphen.includes(queryNoHyphen)) return true;
      
      return false;
    };
    
    // Filter and validate matching records
    const matchingRecords = records.filter((record: OgnRecord) => {
      const registration = record.registration || '';
      const competitionID = record.cn || '';
      
      // Check registration match
      if (isRegistrationMatch(registration, normalizedQuery, normalizedQueryNoHyphen)) return true;
      
      // Check competition ID match
      if (competitionID && 
          (competitionID.toUpperCase() === normalizedQuery || 
           competitionID.toUpperCase().replace(/-/g, '') === normalizedQueryNoHyphen)) {
        return true;
      }
      
      return false;
    });
    
    if (matchingRecords.length === 0) {
      return NextResponse.json<PlaneApiResponse>({
        success: true,
        suggestions: []
      });
    }
    
    // Sort matches: exact registration matches first, then others
    const sortedMatches = matchingRecords.sort((a, b) => {
      const regA = (a.registration || '').toUpperCase();
      const regB = (b.registration || '').toUpperCase();
      
      const exactMatchA = regA === normalizedQuery || regA.replace(/-/g, '') === normalizedQueryNoHyphen;
      const exactMatchB = regB === normalizedQuery || regB.replace(/-/g, '') === normalizedQueryNoHyphen;
      
      if (exactMatchA && !exactMatchB) return -1;
      if (!exactMatchA && exactMatchB) return 1;
      
      // If both or neither are exact matches, prioritize Danish registrations (OY)
      const isDanishA = regA.startsWith('OY');
      const isDanishB = regB.startsWith('OY');
      
      if (isDanishA && !isDanishB) return -1;
      if (!isDanishA && isDanishB) return 1;
      
      return 0;
    });
    
    // Get the best match for prefilling
    const bestMatch = sortedMatches[0];
    const bestMatchData = {
      registration_id: bestMatch.registration || '',
      type: bestMatch.aircraftModel || '',
      flarm_id: bestMatch.deviceId || undefined,
      competition_id: bestMatch.cn || undefined,
      is_twoseater: isTwoSeaterType(bestMatch.aircraftModel || '')
    };
    
    // Format suggestions (up to 5)
    const suggestions = sortedMatches.slice(0, 5).map((record: OgnRecord) => ({
      registration_id: record.registration || '',
      type: record.aircraftModel || '',
      flarm_id: record.deviceId || undefined,
      competition_id: record.cn || undefined
    }));
    
    return NextResponse.json<PlaneApiResponse>({
      success: true,
      plane: bestMatchData,
      suggestions: suggestions
    });
    
  } catch (error) {
    console.error('Error looking up plane:', error);
    return NextResponse.json<PlaneApiResponse>({
      success: false,
      error: 'Failed to lookup plane data'
    }, { status: 500 });
  }
} 