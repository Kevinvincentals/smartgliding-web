import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { flightReplayDataQuerySchema, validateQueryParams } from '@/lib/validations/tablet-api';
import type { ApiResponse } from '@/types/tablet-api';

interface FlarmDataPoint {
  _id: { $oid: string };
  aircraft_id: string;
  timestamp: { $date: string }; // Assuming this is an ISO string date from MongoDB
  latitude: number;
  longitude: number;
  altitude: number | null;
  track: number | null;
  ground_speed: number | null;
  climb_rate: number | null; // Or map from 'vertical_speed' if that's the field name
  turn_rate: number | null;
  // Add other relevant fields from your flarm_data schema if needed
}

interface FlightTrackPoint {
  id: string;
  aircraft_id: string;
  latitude: number;
  longitude: number;
  altitude: number | null;
  track: number | null;
  ground_speed: number | null; // Speed in knots
  climb_rate: number | null; // m/s
  turn_rate: number | null; // degrees/s
  timestamp: string; // ISO string for consistency
}

interface FlightStats {
  minAltitude: number | null;
  maxAltitude: number | null;
  maxSpeed: number | null;    // Speed in knots
  flightDuration: number;   // in minutes
  startTime: string | null; // ISO string
  endTime: string | null;   // ISO string
}

// New interface for FlightLogbook details
interface FlightLogbookDetails {
  pilot1Name: string | null;
  pilot2Name: string | null;
  takeoffTime: string | null; // ISO string
  landingTime: string | null; // ISO string
  launchMethod: string | null;
  registration: string | null;
  planeType: string | null;
  isSchoolFlight: boolean | null;
}

interface FlightTrackDataResponse extends ApiResponse {
  count?: number;
  stats?: FlightStats;
  data?: FlightTrackPoint[];
  flightDetails?: FlightLogbookDetails | null;
}

const initialStats: FlightStats = {
  minAltitude: null,
  maxAltitude: null,
  maxSpeed: null,
  flightDuration: 0,
  startTime: null,
  endTime: null,
};

export async function GET(request: NextRequest): Promise<NextResponse<FlightTrackDataResponse>> {
  try {
    const url = new URL(request.url);
    
    // Validate query parameters with Zod
    const validation = validateQueryParams(flightReplayDataQuerySchema, url.searchParams);
    if (!validation.success) {
      return NextResponse.json<FlightTrackDataResponse>(
        { 
          success: false, 
          error: validation.error,
          count: 0, 
          stats: initialStats, 
          data: [], 
          flightDetails: null,
          ...(validation.details && { details: validation.details.join(', ') })
        }, 
        { status: 400 }
      );
    }

    const queryParams = validation.data;
    const flightLogbookId = queryParams.flight_logbook_id;

    console.log(`Fetching flight replay data for flight: ${flightLogbookId}`);

    // Fetch FlightLogbook details first
    const flightLogbookEntry = await prisma.flightLogbook.findUnique({
      where: { id: flightLogbookId },
      include: {
        pilot1: { select: { firstname: true, lastname: true } },
        pilot2: { select: { firstname: true, lastname: true } },
        plane: { select: { registration_id: true, type: true } },
      }
    });

    let flightDetails: FlightLogbookDetails | null = null;
    if (flightLogbookEntry) {
      flightDetails = {
        pilot1Name: flightLogbookEntry.pilot1 
          ? `${flightLogbookEntry.pilot1.firstname} ${flightLogbookEntry.pilot1.lastname}` 
          : flightLogbookEntry.guest_pilot1_name || null,
        pilot2Name: flightLogbookEntry.pilot2
          ? `${flightLogbookEntry.pilot2.firstname} ${flightLogbookEntry.pilot2.lastname}`
          : flightLogbookEntry.guest_pilot2_name || null,
        takeoffTime: flightLogbookEntry.takeoff_time?.toISOString() || null,
        landingTime: flightLogbookEntry.landing_time?.toISOString() || null,
        launchMethod: flightLogbookEntry.launch_method || null,
        registration: flightLogbookEntry.plane?.registration_id || flightLogbookEntry.registration || null,
        planeType: flightLogbookEntry.plane?.type || flightLogbookEntry.type || null,
        isSchoolFlight: flightLogbookEntry.is_school_flight ?? null,
      };
    }

    // Build aggregation pipeline with optional time filtering
    let matchStage: any = { flight_logbook_id: flightLogbookId };
    
    // Add time range filtering if provided
    if (queryParams.startTime || queryParams.endTime) {
      const timeFilter: any = {};
      
      if (queryParams.startTime) {
        timeFilter.$gte = { $date: new Date(queryParams.startTime).toISOString() };
      }
      
      if (queryParams.endTime) {
        timeFilter.$lte = { $date: new Date(queryParams.endTime).toISOString() };
      }
      
      matchStage.timestamp = timeFilter;
    }

    // Fetch FLARM data points
    const aggregationResult: any = await prisma.$runCommandRaw({
      aggregate: "flarm_data",
      pipeline: [
        { $match: matchStage },
        { $sort: { timestamp: 1 } },
        { $group: { _id: null, allFlightPoints: { $push: "$$ROOT" } } }
      ],
      cursor: {} 
    });

    let flarmDataDocuments: FlarmDataPoint[] = [];
    if (aggregationResult.cursor && aggregationResult.cursor.firstBatch && aggregationResult.cursor.firstBatch.length > 0) {
      flarmDataDocuments = aggregationResult.cursor.firstBatch[0].allFlightPoints || [];
    }

    if (flarmDataDocuments.length === 0) {
      return NextResponse.json<FlightTrackDataResponse>({
        success: true,
        count: 0,
        stats: initialStats,
        data: [],
        flightDetails // Return fetched details even if no FLARM data
      });
    }

    let minAltitudeVal: number | null = null;
    let maxAltitudeVal: number | null = null;
    let maxSpeedVal: number | null = null;
    let minTimestampVal: Date | null = null;
    let maxTimestampVal: Date | null = null;

    const serializedData = flarmDataDocuments.map((point: FlarmDataPoint): FlightTrackPoint => {
      const currentTimestamp = new Date(point.timestamp.$date);

      if (point.altitude !== null && typeof point.altitude === 'number') {
        minAltitudeVal = minAltitudeVal === null ? point.altitude : Math.min(minAltitudeVal, point.altitude);
        maxAltitudeVal = maxAltitudeVal === null ? point.altitude : Math.max(maxAltitudeVal, point.altitude);
      }
      
      if (point.ground_speed !== null && typeof point.ground_speed === 'number') {
        maxSpeedVal = maxSpeedVal === null ? point.ground_speed : Math.max(maxSpeedVal, point.ground_speed);
      }
      
      if (currentTimestamp instanceof Date && !isNaN(currentTimestamp.valueOf())) {
        minTimestampVal = minTimestampVal === null ? currentTimestamp : (currentTimestamp < minTimestampVal ? currentTimestamp : minTimestampVal);
        maxTimestampVal = maxTimestampVal === null ? currentTimestamp : (currentTimestamp > maxTimestampVal ? currentTimestamp : maxTimestampVal);
      }

      return {
        id: point._id.$oid,
        aircraft_id: point.aircraft_id,
        latitude: point.latitude,
        longitude: point.longitude,
        altitude: point.altitude,
        track: point.track,
        ground_speed: point.ground_speed,
        climb_rate: point.climb_rate, 
        turn_rate: point.turn_rate,
        timestamp: currentTimestamp.toISOString(),
      };
    });
    
    const flightDuration = (minTimestampVal && maxTimestampVal && flarmDataDocuments.length > 1)
      ? Math.round(((maxTimestampVal as Date).getTime() - (minTimestampVal as Date).getTime()) / 60000)
      : 0;

    console.log(`Returning flight replay data with ${serializedData.length} points, duration: ${flightDuration} minutes`);

    return NextResponse.json<FlightTrackDataResponse>({
      success: true,
      count: serializedData.length,
      stats: {
        minAltitude: minAltitudeVal !== null ? parseFloat((minAltitudeVal as number).toFixed(1)) : null,
        maxAltitude: maxAltitudeVal !== null ? parseFloat((maxAltitudeVal as number).toFixed(1)) : null,
        maxSpeed: maxSpeedVal !== null ? parseFloat((maxSpeedVal as number).toFixed(1)) : null,
        flightDuration,
        startTime: minTimestampVal ? (minTimestampVal as Date).toISOString() : null,
        endTime: maxTimestampVal ? (maxTimestampVal as Date).toISOString() : null,
      },
      data: serializedData,
      flightDetails // Include flightDetails in the successful response
    });

  } catch (error: unknown) {
    console.error('Error fetching flight replay data:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return NextResponse.json<FlightTrackDataResponse>(
      { 
        success: false, 
        count: 0, 
        stats: initialStats, 
        data: [], 
        flightDetails: null, 
        error: `Failed to fetch flight replay data: ${errorMessage}` 
      },
      { status: 500 }
    );
  }
} 