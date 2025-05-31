import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getStartOfTimezoneDayUTC, getEndOfTimezoneDayUTC } from '@/lib/time-utils';
import { specificFlarmFlightQuerySchema, validateQueryParams } from '@/lib/validations/tablet-api';
import type { ApiResponse } from '@/types/tablet-api';

/**
 * FLARM flight data response
 */
interface FlarmFlightApiResponse extends ApiResponse {
  count?: number
  stats?: {
    minAltitude: number
    maxAltitude: number
    maxSpeed: number
    flightDuration: number
    startTime: Date
    endTime: Date
  }
  data?: Array<{
    timestamp: string | null
    latitude: number
    longitude: number
    altitude: number
    track: number
    ground_speed: number
    climb_rate: number
    turn_rate: number
  }>
}

export async function GET(request: NextRequest): Promise<NextResponse<FlarmFlightApiResponse>> {
  try {
    const url = new URL(request.url);
    
    // Legacy support for aircraft_id parameter
    const legacyAircraftId = url.searchParams.get('aircraft_id');
    if (legacyAircraftId) {
      // Add to searchParams for validation
      url.searchParams.set('flarmId', legacyAircraftId);
      if (!url.searchParams.get('date')) {
        url.searchParams.set('date', new Date().toISOString().split('T')[0]);
      }
    }
    
    // Validate query parameters with Zod
    const validation = validateQueryParams(specificFlarmFlightQuerySchema, url.searchParams);
    if (!validation.success) {
      return NextResponse.json<FlarmFlightApiResponse>(
        { 
          success: false, 
          error: validation.error,
          ...(validation.details && { details: validation.details.join(', ') })
        }, 
        { status: 400 }
      );
    }

    const queryParams = validation.data;
    const aircraft_id = queryParams.flarmId;
    
    console.log(`Fetching flight data for aircraft ${aircraft_id} for date ${queryParams.date}`);

    // Parse the date and get day boundaries
    const targetDate = new Date(queryParams.date);
    const startOfTargetDay = getStartOfTimezoneDayUTC(targetDate);
    const endOfTargetDay = getEndOfTimezoneDayUTC(targetDate);
    
    console.log(`Filtering data between ${startOfTargetDay.toISOString()} and ${endOfTargetDay.toISOString()} (Danish local day in UTC)`);

    // Build time filter for aggregation
    let timeFilter: any = {
      $gte: { $date: startOfTargetDay.toISOString() },
      $lt: { $date: endOfTargetDay.toISOString() }
    };

    // Add specific time range if provided
    if (queryParams.startTime || queryParams.endTime) {
      if (queryParams.startTime) {
        const startDateTime = new Date(`${queryParams.date}T${queryParams.startTime}:00`);
        timeFilter.$gte = { $date: startDateTime.toISOString() };
      }
      if (queryParams.endTime) {
        const endDateTime = new Date(`${queryParams.date}T${queryParams.endTime}:00`);
        timeFilter.$lt = { $date: endDateTime.toISOString() };
      }
    }

    // Use Prisma to query the flarmData collection directly with a proper aggregation pipeline
    const flightData = await prisma.$runCommandRaw({
      aggregate: "flarm_data",
      pipeline: [
        {
          $match: {
            aircraft_id: aircraft_id,
            mongodb_timestamp: timeFilter
          }
        },
        {
          $sort: { mongodb_timestamp: -1 }
        }
      ],
      cursor: { batchSize: 5000 }
    });

    // The result is in a cursor format, we need to extract the data
    let documents = (flightData as any).cursor.firstBatch || [];
    
    console.log(`Found ${documents.length} flight data points for aircraft ${aircraft_id} for specified time range`);
    
    // Log the first document if available to help with debugging
    if (documents.length > 0) {
      console.log('First document sample:', JSON.stringify(documents[0], null, 2));
    } else {
      // If no results, try with different case variations
      console.log('Trying case-insensitive search with regex...');
      const regexSearch = await prisma.$runCommandRaw({
        aggregate: "flarm_data",
        pipeline: [
          {
            $match: {
              aircraft_id: { $regex: aircraft_id, $options: 'i' },
              mongodb_timestamp: timeFilter
            }
          },
          {
            $sort: { mongodb_timestamp: -1 }
          }
        ],
        cursor: { batchSize: 5000 }
      });
      
      const regexResults = (regexSearch as any).cursor.firstBatch || [];
      console.log(`Found ${regexResults.length} results with case-insensitive search`);
      if (regexResults.length > 0) {
        console.log('Case-insensitive match found:', JSON.stringify(regexResults[0], null, 2));
        // Use the results from the regex search
        documents = regexResults;
      }
    }

    if (documents.length === 0) {
      return NextResponse.json<FlarmFlightApiResponse>({
        success: true,
        count: 0,
        stats: {
          minAltitude: 0,
          maxAltitude: 0,
          maxSpeed: 0,
          flightDuration: 0,
          startTime: new Date(),
          endTime: new Date()
        },
        data: []
      });
    }

    // Calculate some statistics
    let minAltitude = Number.MAX_VALUE;
    let maxAltitude = Number.MIN_VALUE;
    let maxSpeed = 0;
    let minTimestamp = new Date();
    let maxTimestamp = new Date(0);

    documents.forEach((point: any) => {
      if (point.altitude !== null && point.altitude !== undefined) {
        minAltitude = Math.min(minAltitude, point.altitude);
        maxAltitude = Math.max(maxAltitude, point.altitude);
      }
      
      if (point.ground_speed !== null && point.ground_speed !== undefined) {
        maxSpeed = Math.max(maxSpeed, point.ground_speed);
      }
      
      if (point.mongodb_timestamp) {
        const timestamp = new Date(point.mongodb_timestamp.$date);
        if (timestamp < minTimestamp) {
          minTimestamp = timestamp;
        }
        if (timestamp > maxTimestamp) {
          maxTimestamp = timestamp;
        }
      }
    });

    // If no data found, adjust these values
    if (minAltitude === Number.MAX_VALUE) minAltitude = 0;
    if (maxAltitude === Number.MIN_VALUE) maxAltitude = 0;
    
    // Flight duration in minutes
    const flightDuration = documents.length > 1 
      ? Math.round((maxTimestamp.getTime() - minTimestamp.getTime()) / 60000) 
      : 0;

    // Fix date and ObjectId formats for JSON serialization and remove redundant fields
    const serializedData = documents.map((item: any) => {
      return {
        timestamp: item.timestamp && item.timestamp.$date ? new Date(item.timestamp.$date).toISOString() : null,
        latitude: item.latitude,
        longitude: item.longitude,
        altitude: item.altitude,
        track: item.track,
        ground_speed: item.ground_speed,
        climb_rate: item.climb_rate,
        turn_rate: item.turn_rate
      };
    });

    return NextResponse.json<FlarmFlightApiResponse>({
      success: true,
      count: documents.length,
      stats: {
        minAltitude,
        maxAltitude,
        maxSpeed,
        flightDuration,
        startTime: minTimestamp,
        endTime: maxTimestamp
      },
      data: serializedData
    });
  } catch (error: unknown) {
    console.error('Error fetching flight data:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return NextResponse.json<FlarmFlightApiResponse>(
      { success: false, error: `Failed to fetch flight data: ${errorMessage}` },
      { status: 500 }
    );
  }
}
