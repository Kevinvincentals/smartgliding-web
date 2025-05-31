import { prisma } from '@/lib/prisma';

// Interface to represent flight statistics
export interface FlightStatistics {
  maxAltitude: number | null;
  maxSpeed: number | null;
  distance: number | null;
  calculationSuccessful: boolean;
}

/**
 * Calculate great-circle distance between two points using the Haversine formula
 * @param lat1 First point latitude
 * @param lon1 First point longitude
 * @param lat2 Second point latitude
 * @param lon2 Second point longitude
 * @returns Distance in kilometers
 */
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth radius in kilometers
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

/**
 * Calculate total flight distance from a series of coordinates
 * @param points Array of points with latitude and longitude
 * @returns Total distance in kilometers
 */
function calculateTotalDistance(points: Array<{latitude: number, longitude: number}>): number {
  if (points.length < 2) return 0;
  
  let totalDistance = 0;
  
  for (let i = 1; i < points.length; i++) {
    const prevPoint = points[i-1];
    const currentPoint = points[i];
    
    if (
      prevPoint.latitude != null && typeof prevPoint.latitude === 'number' &&
      prevPoint.longitude != null && typeof prevPoint.longitude === 'number' &&
      currentPoint.latitude != null && typeof currentPoint.latitude === 'number' &&
      currentPoint.longitude != null && typeof currentPoint.longitude === 'number'
    ) {
      totalDistance += calculateDistance(
        prevPoint.latitude, 
        prevPoint.longitude, 
        currentPoint.latitude, 
        currentPoint.longitude
      );
    }
  }
  
  return totalDistance;
}

/**
 * Calculate flight statistics from FLARM data
 * @param flightId The flight logbook ID to calculate statistics for (this is flight_logbook._id)
 * @returns Object containing the calculated statistics
 */
export async function calculateFlightStatistics(flightId: string): Promise<FlightStatistics> {
  // Note: The primary FLARM data fetch uses prisma.$runCommandRaw with an aggregation pipeline.
  // This approach was chosen to ensure all matching flarm_data records for a given flight_logbook_id
  // (which is a string in flarm_data) are retrieved reliably. Previous attempts using direct
  // Prisma Client `findMany` or relational includes on FlarmData.flight_logbook_id (String? @db.ObjectId)
  // inconsistently returned zero results despite data existing in the database. I think this is due to the python backend not being in sync with the prisma schema. Should be fixed later....
  try {
    let flarmDataPoints: any[] = [];

    // Primary method: Use $runCommandRaw with an aggregation pipeline
    const aggregationResult: any = await prisma.$runCommandRaw({
      aggregate: "flarm_data",
      pipeline: [
        { $match: { flight_logbook_id: flightId } },
        { $sort: { timestamp: 1 } }, // Sort by FLARM device timestamp
        // Group all matched documents into a single array field in one result document.
        // Note: This can be memory intensive for extremely large numbers of points per flight.
        { $group: { _id: null, allFlightPoints: { $push: "$$ROOT" } } }
      ],
      cursor: {} // Required for aggregation commands
    });

    if (aggregationResult.cursor && aggregationResult.cursor.firstBatch && aggregationResult.cursor.firstBatch.length > 0) {
      // The result of the $group stage is an array (firstBatch) containing a single document (if matches found),
      // where the grouped points are in the 'allFlightPoints' field.
      flarmDataPoints = aggregationResult.cursor.firstBatch[0].allFlightPoints || [];
    } else {
      flarmDataPoints = [];
    }

    // Fallback method
    if (flarmDataPoints.length < 2) {
      const flightDetailsResult: any = await prisma.$runCommandRaw({
        find: "flight_logbook",
        filter: { _id: { $oid: flightId } },
        projection: { flarm_id: 1, takeoff_time: 1, landing_time: 1 },
        limit: 1
      });
      const flightDetails = flightDetailsResult.cursor?.firstBatch?.[0];

      if (flightDetails) { // Check if flightDetails itself is found
        const aircraftId = flightDetails.flarm_id;
        const takeoffTimeRaw = flightDetails.takeoff_time;
        const landingTimeRaw = flightDetails.landing_time;

        let takeoffTime: Date | null = null;
        let landingTime: Date | null = null;

        if (takeoffTimeRaw) {
          takeoffTime = new Date(takeoffTimeRaw);
          if (isNaN(takeoffTime.valueOf())) takeoffTime = null;
        }
        if (landingTimeRaw) {
          landingTime = new Date(landingTimeRaw);
          if (isNaN(landingTime.valueOf())) landingTime = null;
        }

        if (aircraftId && takeoffTime && landingTime) {
          flarmDataPoints = await prisma.flarmData.findMany({
            where: {
              aircraft_id: aircraftId,
              timestamp: { 
                gte: takeoffTime,
                lte: landingTime
              }
            },
            orderBy: { timestamp: 'asc' }
          });
        } else {
          console.log(`Fallback: Incomplete data for fallback. AircraftId: ${aircraftId}, Valid Takeoff: ${!!takeoffTime}, Valid Landing: ${!!landingTime}. Skipping fallback.`);
        }
      } else {
        console.log(`Could not use fallback: flight_logbook entry not found for ID ${flightId}.`);
      }
    }
    
    if (flarmDataPoints.length < 2) {
      console.log(`Insufficient FLARM data points after all attempts for flight ID: ${flightId} (total found: ${flarmDataPoints.length}).`);
      return {
        maxAltitude: null,
        maxSpeed: null,
        distance: null,
        calculationSuccessful: false
      };
    }
    
    let maxAltitude = 0;
    flarmDataPoints.forEach((point: any) => {
      if (point.altitude != null && typeof point.altitude === 'number' && point.altitude > maxAltitude) {
        maxAltitude = point.altitude;
      }
    });
    
    let maxSpeed = 0;
    flarmDataPoints.forEach((point: any) => {
      if (point.ground_speed != null && typeof point.ground_speed === 'number' && point.ground_speed > maxSpeed) {
        maxSpeed = point.ground_speed;
      }
    });
    
    const validPointsForDistance = flarmDataPoints
      .filter((point: any) => 
        point.latitude != null && typeof point.latitude === 'number' &&
        point.longitude != null && typeof point.longitude === 'number'
      )
      .map((point: any) => ({ latitude: point.latitude, longitude: point.longitude }));
    
    let totalDistance = 0;
    if (validPointsForDistance.length >= 2) {
      totalDistance = calculateTotalDistance(validPointsForDistance);
    } else {
      console.log(`Not enough valid (lat/lon) points for distance calculation for ID: ${flightId} (found ${validPointsForDistance.length}). Distance will be 0.`);
    }
    
    // Convert maxSpeed from knots to km/h
    const maxSpeedKmh = maxSpeed * 1.852;
    
    return {
      maxAltitude: Number(maxAltitude.toFixed(1)),
      maxSpeed: Number(maxSpeedKmh.toFixed(1)),
      distance: Number(totalDistance.toFixed(1)),
      calculationSuccessful: true 
    };
  } catch (error) {
    console.error(`Error in calculateFlightStatistics for flight ID ${flightId}:`, error);
    return {
      maxAltitude: null,
      maxSpeed: null,
      distance: null,
      calculationSuccessful: false
    };
  }
} 