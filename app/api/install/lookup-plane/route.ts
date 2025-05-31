import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';

// Define an interface for our record structure
interface OgnRecord {
  type: string;
  flarmID: string;
  model: string;
  registration: string;
  competitionID: string;
  tracked: string;
  identified: string;
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
    
    // Read the CSV file
    const filePath = path.join(process.cwd(), 'data/glider_database.csv');
    const fileContents = await fs.readFile(filePath, 'utf8');
    
    // Parse CSV
    const records = parse(fileContents, {
      columns: ['type', 'flarmID', 'model', 'registration', 'competitionID', 'tracked', 'identified'],
      skip_empty_lines: true,
      trim: true,
      relax_quotes: true,
      skip_records_with_error: true,
      comment: '#'
    }) as OgnRecord[];
    
    // Helper function to clean record values
    const cleanValue = (value: string | undefined): string => {
      if (!value) return '';
      return value.replace(/['"]+/g, '');
    };
    
    // Helper function to check if a registration matches the search query
    const isRegistrationMatch = (registration: string, query: string, queryNoHyphen: string): boolean => {
      if (!registration) return false;
      
      const regUpper = registration.toUpperCase();
      const regNoHyphen = regUpper.replace(/-/g, '');
      
      // Exact match with or without hyphen
      if (regUpper === query || regNoHyphen === queryNoHyphen) return true;
      
      // Partial match
      if (regUpper.includes(query) || regNoHyphen.includes(queryNoHyphen)) return true;
      
      return false;
    };
    
    // Find matching records
    const matchingRecords = records.filter((record: OgnRecord) => {
      const type = cleanValue(record.type);
      const registration = cleanValue(record.registration);
      const competitionID = cleanValue(record.competitionID);
      
      // Exclude paragliders (P), ultralights (U), and balloons (B)
      if (type === 'P' || type === 'U' || type === 'B') return false;
      
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
      const regA = cleanValue(a.registration).toUpperCase();
      const regB = cleanValue(b.registration).toUpperCase();
      
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
      registration_id: cleanValue(bestMatch.registration),
      type: cleanValue(bestMatch.model),
      flarm_id: cleanValue(bestMatch.flarmID) || undefined,
      competition_id: cleanValue(bestMatch.competitionID) || undefined,
      is_twoseater: isTwoSeaterType(cleanValue(bestMatch.model))
    };
    
    // Format suggestions (up to 5)
    const suggestions = sortedMatches.slice(0, 5).map((record: OgnRecord) => ({
      registration_id: cleanValue(record.registration),
      type: cleanValue(record.model),
      flarm_id: cleanValue(record.flarmID) || undefined,
      competition_id: cleanValue(record.competitionID) || undefined
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