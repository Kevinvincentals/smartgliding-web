import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { igcDownloadQuerySchema, validateQueryParams } from '@/lib/validations/tablet-api';
import type { ApiResponse } from '@/types/tablet-api';

// IGC record types
const RECORD_TYPE_HEADER = 'H';
const RECORD_TYPE_BRECORD = 'B';
const RECORD_TYPE_EXTENSION = 'I';

/**
 * IGC download response (for error cases)
 */
interface IGCApiResponse extends ApiResponse {}

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const url = new URL(request.url);
    
    // Validate query parameters with Zod
    const validation = validateQueryParams(igcDownloadQuerySchema, url.searchParams);
    if (!validation.success) {
      return NextResponse.json<IGCApiResponse>(
        { 
          success: false, 
          error: validation.error,
          ...(validation.details && { details: validation.details.join(', ') })
        }, 
        { status: 400 }
      );
    }

    const queryParams = validation.data;
    const flightLogbookId = queryParams.flight_logbook_id;

    console.log(`Generating IGC file for flight: ${flightLogbookId}, format: ${queryParams.format}`);

    // Fetch FlightLogbook details
    const flightLogbookEntry = await prisma.flightLogbook.findUnique({
      where: { id: flightLogbookId },
      include: {
        pilot1: { select: { firstname: true, lastname: true } },
        pilot2: { select: { firstname: true, lastname: true } },
        plane: { select: { registration_id: true, type: true, competition_id: true } },
      }
    });

    if (!flightLogbookEntry) {
      return NextResponse.json<IGCApiResponse>(
        { success: false, error: 'Flight not found' },
        { status: 404 }
      );
    }

    // Get pilot name
    const pilotName = flightLogbookEntry.pilot1 
      ? `${flightLogbookEntry.pilot1.firstname} ${flightLogbookEntry.pilot1.lastname}` 
      : flightLogbookEntry.guest_pilot1_name || 'Unknown';

    // Get glider registration and type
    const gliderRegistration = flightLogbookEntry.plane?.registration_id || flightLogbookEntry.registration || 'UNKNOWN';
    const gliderType = flightLogbookEntry.plane?.type || flightLogbookEntry.type || 'UNKNOWN';
    
    // Get competition ID if available
    const competitionId = flightLogbookEntry.plane?.competition_id || '';

    // Get flight date from takeoff time or creation date
    const flightDate = flightLogbookEntry.takeoff_time || flightLogbookEntry.createdAt;
    const dateString = formatDateForIGC(flightDate);

    // Fetch FLARM data points
    const aggregationResult: any = await prisma.$runCommandRaw({
      aggregate: "flarm_data",
      pipeline: [
        { $match: { flight_logbook_id: flightLogbookId } },
        { $sort: { timestamp: 1 } },
        { $group: { _id: null, allFlightPoints: { $push: "$$ROOT" } } }
      ],
      cursor: {} 
    });

    let flarmDataDocuments: any[] = [];
    if (aggregationResult.cursor && aggregationResult.cursor.firstBatch && aggregationResult.cursor.firstBatch.length > 0) {
      flarmDataDocuments = aggregationResult.cursor.firstBatch[0].allFlightPoints || [];
    }

    if (flarmDataDocuments.length === 0) {
      return NextResponse.json<IGCApiResponse>(
        { success: false, error: 'No flight data found' },
        { status: 404 }
      );
    }

    // Generate IGC file
    const igcContent = generateIGCFile({
      pilotName,
      gliderRegistration,
      gliderType,
      competitionId,
      dateString,
      flightPoints: flarmDataDocuments.map(point => ({
        timestamp: new Date(point.timestamp.$date),
        latitude: point.latitude,
        longitude: point.longitude,
        altitude: point.altitude,
        pressure_altitude: point.pressure_altitude || point.altitude, // Use barometric altitude if available, otherwise GPS altitude
      }))
    });

    // Generate a filename based on the date, glider registration and pilot name
    const normalizedPilotName = pilotName.replace(/\s+/g, '_').replace(/[^\w\d_]/g, '');
    const filename = `${dateString}_${gliderRegistration.replace(/-/g, '_')}_${normalizedPilotName}.igc`;

    console.log(`Generated IGC file: ${filename} with ${flarmDataDocuments.length} data points`);

    // Return the IGC file
    return new Response(igcContent, {
      headers: {
        'Content-Type': 'text/plain',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });

  } catch (error: unknown) {
    console.error('Error generating IGC file:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return NextResponse.json<IGCApiResponse>(
      { success: false, error: `Failed to generate IGC file: ${errorMessage}` },
      { status: 500 }
    );
  }
}

// Helper function to format date for IGC
function formatDateForIGC(date: Date): string {
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear().toString().slice(2); // Last two digits of year
  return `${day}${month}${year}`;
}

// Function to generate IGC file content
function generateIGCFile({ 
  pilotName, 
  gliderRegistration, 
  gliderType, 
  competitionId,
  dateString, 
  flightPoints 
}: {
  pilotName: string;
  gliderRegistration: string;
  gliderType: string;
  competitionId: string;
  dateString: string;
  flightPoints: Array<{
    timestamp: Date;
    latitude: number;
    longitude: number;
    altitude: number | null;
    pressure_altitude: number | null;
  }>;
}): string {
  let igcContent = '';

  // Standard IGC header
  igcContent += `AXXXFSK\r\n`; // Manufacturer and device ID (FSK is our identifier)
  
  // Date declaration
  igcContent += `${RECORD_TYPE_HEADER}FDTEFLIGHT:${dateString}\r\n`;
  
  // Pilot declaration
  igcContent += `${RECORD_TYPE_HEADER}FPLTPILOT:${pilotName}\r\n`;
  
  // Glider declaration
  igcContent += `${RECORD_TYPE_HEADER}FGTYGLIDERTYPE:${gliderType}\r\n`;
  igcContent += `${RECORD_TYPE_HEADER}FGIDGLIDERID:${gliderRegistration}\r\n`;
  
  // Competition ID if available
  if (competitionId) {
    igcContent += `${RECORD_TYPE_HEADER}FCIDCOMPETITIONID:${competitionId}\r\n`;
  }

  // Add data source
  igcContent += `${RECORD_TYPE_HEADER}FSITSITE:FLYSAFE-KNAPP\r\n`;
  
  // Extension declaration for additional data 
  igcContent += `${RECORD_TYPE_EXTENSION}013638GSP\r\n`; // This declares that bytes 36-38 contain groundspeed

  // Generate B (position) records for each data point
  for (const point of flightPoints) {
    // Format time (hhmmss)
    const timeStr = formatTimeForIGC(point.timestamp);
    
    // Format latitude (ddmmmmm[N/S])
    const latStr = formatLatitudeForIGC(point.latitude);
    
    // Format longitude (dddmmmmm[E/W])
    const lonStr = formatLongitudeForIGC(point.longitude);
    
    // GPS fix validity (A=valid, V=invalid)
    const fixValidity = 'A';
    
    // Pressure altitude and GPS altitude (in meters, zero-padded to 5 digits)
    const pressAlt = Math.round(point.pressure_altitude || 0).toString().padStart(5, '0');
    const gpsAlt = Math.round(point.altitude || 0).toString().padStart(5, '0');
    
    // B record format: B + time + lat + lon + fix + pressure alt + gps alt
    igcContent += `${RECORD_TYPE_BRECORD}${timeStr}${latStr}${lonStr}${fixValidity}${pressAlt}${gpsAlt}\r\n`;
  }

  return igcContent;
}

// Format time for IGC record (hhmmss)
function formatTimeForIGC(date: Date): string {
  const hours = date.getUTCHours().toString().padStart(2, '0');
  const minutes = date.getUTCMinutes().toString().padStart(2, '0');
  const seconds = date.getUTCSeconds().toString().padStart(2, '0');
  return `${hours}${minutes}${seconds}`;
}

// Format latitude for IGC record (ddmmmmm[N/S])
function formatLatitudeForIGC(latitude: number): string {
  const hemisphere = latitude >= 0 ? 'N' : 'S';
  const absLat = Math.abs(latitude);
  const degrees = Math.floor(absLat);
  const minutes = (absLat - degrees) * 60;
  const minutesStr = (minutes * 1000).toFixed(0).padStart(5, '0');
  return `${degrees.toString().padStart(2, '0')}${minutesStr}${hemisphere}`;
}

// Format longitude for IGC record (dddmmmmm[E/W])
function formatLongitudeForIGC(longitude: number): string {
  const hemisphere = longitude >= 0 ? 'E' : 'W';
  const absLon = Math.abs(longitude);
  const degrees = Math.floor(absLon);
  const minutes = (absLon - degrees) * 60;
  const minutesStr = (minutes * 1000).toFixed(0).padStart(5, '0');
  return `${degrees.toString().padStart(3, '0')}${minutesStr}${hemisphere}`;
} 