import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';
import { ognDatabaseQuerySchema, validateQueryParams } from '@/lib/validations/tablet-api';
import type { ApiResponse } from '@/types/tablet-api';

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
 * OGN database search response
 */
interface OgnDatabaseApiResponse extends ApiResponse {
  planes?: Array<{
    flarmID: string
    model: string
    registration: string
    competitionID: string
  }>
  query?: string
  results?: Array<{
    flarmID: string
    model: string
    registration: string
    competitionID: string
  }>
  count?: number
  totalCount?: number
}

export async function GET(request: NextRequest): Promise<NextResponse<OgnDatabaseApiResponse>> {
  try {
    const url = new URL(request.url);
    
    // Validate query parameters with Zod
    const validation = validateQueryParams(ognDatabaseQuerySchema, url.searchParams);
    if (!validation.success) {
      return NextResponse.json<OgnDatabaseApiResponse>(
        { 
          success: false, 
          error: validation.error,
          ...(validation.details && { details: validation.details.join(', ') })
        }, 
        { status: 400 }
      );
    }

    const queryParams = validation.data;
    const query = queryParams.query;
    
    if (!query || query.length < 2) {
      return NextResponse.json<OgnDatabaseApiResponse>({
        success: false,
        error: 'Search query must be at least 2 characters long'
      }, { status: 400 });
    }
    
    console.log(`Searching OGN database for: ${query}, limit: ${queryParams.limit}`);
    
    // Normalize the query (uppercase, trim, remove hyphens for some comparisons)
    const normalizedQuery = query.trim().toUpperCase();
    const normalizedQueryNoHyphen = normalizedQuery.replace(/-/g, '');
    
    // Read the CSV file
    const filePath = path.join(process.cwd(), 'data/glider_database.csv');
    const fileContents = await fs.readFile(filePath, 'utf8');
    
    // Parse CSV
    // Format: 'F','DF1238','SZD-50 Puchacz','OY-TXD','TD','Y','Y'
    // [type, flarmID, model, registration, competitionID, tracked, identified]
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
    
    // Helper function to check if a registration matches the search query in any format
    const isRegistrationMatch = (registration: string, query: string, queryNoHyphen: string): boolean => {
      if (!registration) return false;
      
      const regUpper = registration.toUpperCase();
      const regNoHyphen = regUpper.replace(/-/g, '');
      
      // Exact match with or without hyphen
      if (regUpper === query || regNoHyphen === queryNoHyphen) return true;
      
      // If query is sufficiently long (2+ chars), check if registration contains it
      if (query.length >= 2 && regUpper.includes(query)) return true;
      
      // Or check if the no-hyphen version contains the no-hyphen query
      if (queryNoHyphen.length >= 2 && regNoHyphen.includes(queryNoHyphen)) return true;
      
      return false;
    };
    
    // First pass: Find exact matches with Danish registration (OY)
    const danishExactMatches = records.filter((record: OgnRecord) => {
      const type = cleanValue(record.type);
      const registration = cleanValue(record.registration);
      
      // Exclude paragliders (P), ultralights (U), and balloons (B)
      if (type === 'P' || type === 'U' || type === 'B') return false;
      
      // Check if it's a Danish registration with exact match
      if (registration.toUpperCase().startsWith('OY') && 
          isRegistrationMatch(registration, normalizedQuery, normalizedQueryNoHyphen)) {
        return true;
      }
      
      return false;
    });
    
    // Second pass: Find Danish partial matches (with OY in the registration)
    const danishPartialMatches = records.filter((record: OgnRecord) => {
      const type = cleanValue(record.type);
      const registration = cleanValue(record.registration);
      
      // Skip if already in Danish exact matches
      if (danishExactMatches.some(m => cleanValue(m.registration) === registration)) return false;
      
      // Exclude paragliders (P), ultralights (U), and balloons (B)
      if (type === 'P' || type === 'U' || type === 'B') return false;
      
      // Check if it's a Danish registration with partial match
      // This will prioritize "OY-XXX" registrations even for partial searches like "SE"
      if (registration.toUpperCase().includes('OY')) {
        const regUpper = registration.toUpperCase();
        const regNoHyphen = regUpper.replace(/-/g, '');
        
        if (regUpper.includes(normalizedQuery) || regNoHyphen.includes(normalizedQueryNoHyphen)) {
          return true;
        }
      }
      
      return false;
    });
    
    // Third pass: Find exact matches on registration or competition ID (non-Danish)
    const otherExactMatches = records.filter((record: OgnRecord) => {
      const type = cleanValue(record.type);
      const registration = cleanValue(record.registration);
      const competitionID = cleanValue(record.competitionID);
      
      // Exclude already matched Danish registrations
      if ([...danishExactMatches, ...danishPartialMatches].some(m => 
           cleanValue(m.registration) === registration)) return false;
      
      // Exclude paragliders (P), ultralights (U), and balloons (B)
      if (type === 'P' || type === 'U' || type === 'B') return false;
      
      // Exact match on registration
      if (isRegistrationMatch(registration, normalizedQuery, normalizedQueryNoHyphen)) return true;
      
      // Exact match on competition ID
      if (competitionID && 
          (competitionID.toUpperCase() === normalizedQuery || 
           competitionID.toUpperCase().replace(/-/g, '') === normalizedQueryNoHyphen)) {
        return true;
      }
      
      return false;
    });
    
    // Fourth pass: Find other partial matches
    const otherPartialMatches = records.filter((record: OgnRecord) => {
      const type = cleanValue(record.type);
      const registration = cleanValue(record.registration);
      const competitionID = cleanValue(record.competitionID);
      const model = cleanValue(record.model);
      
      // Skip if already found in previous matches
      if ([...danishExactMatches, ...danishPartialMatches, ...otherExactMatches].some(m => 
          cleanValue(m.registration) === registration && 
          cleanValue(m.competitionID) === competitionID)) {
        return false;
      }
      
      // Exclude paragliders (P), ultralights (U), and balloons (B)
      if (type === 'P' || type === 'U' || type === 'B') return false;
      
      // If registration contains the query (at least 2 chars)
      const regUpper = registration.toUpperCase();
      const regNoHyphen = regUpper.replace(/-/g, '');
      if (normalizedQuery.length >= 2 && regUpper.includes(normalizedQuery)) return true;
      if (normalizedQueryNoHyphen.length >= 2 && regNoHyphen.includes(normalizedQueryNoHyphen)) return true;
      
      // If competition ID contains the query
      if (competitionID && competitionID.toUpperCase().includes(normalizedQuery)) return true;
      
      // Model is lowest priority
      if (model && model.toUpperCase().includes(normalizedQuery)) {
        // Only include model matches if there are no better matches
        return danishExactMatches.length === 0 && 
               danishPartialMatches.length === 0 && 
               otherExactMatches.length === 0;
      }
      
      return false;
    });
    
    // Combine results in priority order: 
    // 1. Danish exact matches
    // 2. Danish partial matches (with OY in reg)
    // 3. Other exact matches
    // 4. Other partial matches
    const combinedResults = [
      ...danishExactMatches,
      ...danishPartialMatches,
      ...otherExactMatches,
      ...otherPartialMatches
    ];
    
    // Format the results
    const formattedResults = combinedResults.map((record: OgnRecord) => ({
      flarmID: cleanValue(record.flarmID),
      model: cleanValue(record.model),
      registration: cleanValue(record.registration),
      competitionID: cleanValue(record.competitionID)
    }));
    
    // Limit results to top 15
    const limitedResults = formattedResults.slice(0, 15);
    
    return NextResponse.json<OgnDatabaseApiResponse>({
      success: true,
      query: normalizedQuery,
      results: limitedResults,
      count: limitedResults.length,
      totalCount: formattedResults.length
    });
    
  } catch (error) {
    return NextResponse.json<OgnDatabaseApiResponse>({
      success: false,
      error: 'Failed to search OGN database'
    }, { status: 500 });
  }
} 