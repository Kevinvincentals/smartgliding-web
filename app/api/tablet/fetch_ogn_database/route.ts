import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ognDatabaseQuerySchema, validateQueryParams } from '@/lib/validations/tablet-api';
import type { ApiResponse } from '@/types/tablet-api';

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
    
    // Query the database instead of reading CSV
    // First pass: Find exact matches with Danish registration (OY)
    const danishExactMatches = await prisma.ognDatabase.findMany({
      where: {
        AND: [
          {
            deviceType: {
              notIn: ['P', 'U', 'B'] // Exclude paragliders (P), ultralights (U), and balloons (B)
            }
          },
          {
            registration: {
              startsWith: 'OY',
              mode: 'insensitive'
            }
          },
          {
            OR: [
              {
                registration: {
                  equals: normalizedQuery,
                  mode: 'insensitive'
                }
              },
              {
                registration: {
                  equals: normalizedQuery.replace(/-/g, ''),
                  mode: 'insensitive'
                }
              }
            ]
          }
        ]
      },
      take: 15
    });
    
    // Second pass: Find Danish partial matches (with OY in the registration)
    const danishPartialMatches = await prisma.ognDatabase.findMany({
      where: {
        AND: [
          {
            deviceType: {
              notIn: ['P', 'U', 'B']
            }
          },
          {
            registration: {
              contains: 'OY',
              mode: 'insensitive'
            }
          },
          {
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
              }
            ]
          },
          {
            NOT: {
              id: {
                in: danishExactMatches.map(m => m.id)
              }
            }
          }
        ]
      },
      take: 15
    });
    
    // Third pass: Find exact matches on registration or competition ID (non-Danish)
    const otherExactMatches = await prisma.ognDatabase.findMany({
      where: {
        AND: [
          {
            deviceType: {
              notIn: ['P', 'U', 'B']
            }
          },
          {
            NOT: {
              registration: {
                contains: 'OY',
                mode: 'insensitive'
              }
            }
          },
          {
            OR: [
              {
                registration: {
                  equals: normalizedQuery,
                  mode: 'insensitive'
                }
              },
              {
                registration: {
                  equals: normalizedQueryNoHyphen,
                  mode: 'insensitive'
                }
              },
              {
                cn: {
                  equals: normalizedQuery,
                  mode: 'insensitive'
                }
              },
              {
                cn: {
                  equals: normalizedQueryNoHyphen,
                  mode: 'insensitive'
                }
              }
            ]
          }
        ]
      },
      take: 15
    });
    
    // Fourth pass: Find other partial matches
    const otherPartialMatches = await prisma.ognDatabase.findMany({
      where: {
        AND: [
          {
            deviceType: {
              notIn: ['P', 'U', 'B']
            }
          },
          {
            NOT: {
              id: {
                in: [...danishExactMatches, ...danishPartialMatches, ...otherExactMatches].map(m => m.id)
              }
            }
          },
          {
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
              // Only include model matches if there are no better matches
              ...(danishExactMatches.length === 0 && 
                 danishPartialMatches.length === 0 && 
                 otherExactMatches.length === 0 ? [{
                aircraftModel: {
                  contains: normalizedQuery,
                  mode: 'insensitive' as const
                }
              }] : [])
            ]
          }
        ]
      },
      take: 15
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
      flarmID: record.deviceId || '',
      model: record.aircraftModel || '',
      registration: record.registration || '',
      competitionID: record.cn || ''
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
    console.error('Error searching OGN database:', error);
    return NextResponse.json<OgnDatabaseApiResponse>({
      success: false,
      error: 'Failed to search OGN database'
    }, { status: 500 });
  }
} 