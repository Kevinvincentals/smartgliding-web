import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { 
  getStartOfTimezoneDayUTC, 
  getEndOfTimezoneDayUTC, 
  getStartOfTimezoneYearUTC,
  formatUTCDateToLocalTime
} from '@/lib/time-utils';
import { JWTPayload } from '@/lib/jwt';
import { statisticsQuerySchema, validateQueryParams } from '@/lib/validations/tablet-api';
import type { ApiResponse } from '@/types/tablet-api';

/**
 * Statistics API response
 */
interface StatisticsApiResponse extends ApiResponse {
  statistics?: {
    totalFlights: number
    flightsInProgress: number
    completedFlights: number
    totalFlightTime: string
    longestFlight?: {
      registration: string
      duration: string
      pilot: string
    }
    averageFlightTime: string
    uniquePilots: number
    uniqueAircraft: number
    flightsDetail: Array<{
      id: string
      registration: string
      type: string
      pilot: string
      coPilot?: string
      takeoffTime?: string
      landingTime?: string
      duration: string
      status: string
    }>
  }
}

export async function GET(request: NextRequest): Promise<NextResponse<StatisticsApiResponse>> {
  try {
    const url = new URL(request.url);
    
    // Validate query parameters with Zod
    const validation = validateQueryParams(statisticsQuerySchema, url.searchParams);
    if (!validation.success) {
      return NextResponse.json<StatisticsApiResponse>(
        { 
          success: false, 
          error: validation.error,
          ...(validation.details && { details: validation.details.join(', ') })
        }, 
        { status: 400 }
      );
    }

    const queryParams = validation.data;
    
    // Legacy support for 'period' parameter
    const period = url.searchParams.get('period') || 'today';
    const dateParam = url.searchParams.get('date');
    
    // ClubId will come from JWT
    const jwtPayloadString = request.headers.get('x-jwt-payload');
    if (!jwtPayloadString) {
      return NextResponse.json<StatisticsApiResponse>(
        { success: false, error: 'Authentication token not found.' }, 
        { status: 401 }
      );
    }
    
    const jwtPayload: JWTPayload = JSON.parse(jwtPayloadString);
    const clubId = jwtPayload.clubId || jwtPayload.id;
    const homefield = jwtPayload.homefield;

    if (!clubId) {
      return NextResponse.json<StatisticsApiResponse>(
        { success: false, error: 'Club ID not found in authentication token.' }, 
        { status: 401 }
      );
    }
    
    console.log(`Fetching statistics for club ID: ${clubId}, period: ${period}, params:`, queryParams);
    
    // Get date to use (priority: dateParam, then startDate from validation, then today)
    let targetDate: Date;
    if (dateParam) {
      targetDate = new Date(dateParam);
      if (isNaN(targetDate.getTime())) {
        return NextResponse.json<StatisticsApiResponse>(
          { success: false, error: 'Invalid date format. Use YYYY-MM-DD' },
          { status: 400 }
        );
      }
    } else if (queryParams.startDate) {
      targetDate = new Date(queryParams.startDate);
    } else {
      targetDate = new Date();
    }
    
    // Get the date range based on Danish local time, expressed in UTC
    const startOfTargetDate = getStartOfTimezoneDayUTC(targetDate);
    const endOfTargetDate = getEndOfTimezoneDayUTC(targetDate);
    
    // Get start of year/month based on queryParams
    let startOfPeriod: Date;
    if (queryParams.year !== undefined) {
      startOfPeriod = getStartOfTimezoneYearUTC(new Date(queryParams.year, 0, 1));
      if (queryParams.month !== undefined) {
        startOfPeriod = getStartOfTimezoneDayUTC(new Date(queryParams.year, queryParams.month - 1, 1));
      }
    } else if (period === 'year') {
      startOfPeriod = getStartOfTimezoneYearUTC(targetDate);
    } else {
      startOfPeriod = startOfTargetDate;
    }

    // Build the where clause based on requested period
    let dateConditions: any;
    
    if (period === 'today' || (!queryParams.year && !queryParams.month)) {
      dateConditions = {
        OR: [
          // Flights that took off on target date
          {
            takeoff_time: {
              gte: startOfTargetDate,
              lte: endOfTargetDate
            }
          },
          // Flights that landed on target date
          {
            landing_time: {
              gte: startOfTargetDate,
              lte: endOfTargetDate
            }
          },
          // Flights that were created on target date (including those without takeoff/landing times)
          {
            createdAt: {
              gte: startOfTargetDate,
              lte: endOfTargetDate
            }
          }
        ]
      };
    } else {
      dateConditions = {
        OR: [
          // Flights that took off in target period
          {
            takeoff_time: {
              gte: startOfPeriod,
              lte: endOfTargetDate
            }
          },
          // Flights that landed in target period
          {
            landing_time: {
              gte: startOfPeriod,
              lte: endOfTargetDate
            }
          }
        ]
      };
    }

    // Restructure the whereClause to match fetch_flights logic
    let whereClause: any = {
      AND: [
        // Date conditions
        dateConditions,
        // Not deleted
        { deleted: false }
      ],
      // Either match club OR match airfield (same logic as fetch_flights)
      OR: [
        // Either clubId matches
        { clubId: clubId },
        // OR the airfield matches our homefield (either takeoff or landing)
        ...(homefield ? [
          {
            OR: [
              { takeoff_airfield: homefield },
              { landing_airfield: homefield }
            ]
          }
        ] : [])
      ]
    };

    // Add pilot filter if specified
    if (queryParams.pilotId) {
      whereClause.AND.push({
        OR: [
          { pilot1Id: queryParams.pilotId },
          { pilot2Id: queryParams.pilotId }
        ]
      });
    }

    // Add aircraft filter if specified
    if (queryParams.aircraftId) {
      whereClause.AND.push({ planeId: queryParams.aircraftId });
    }

    // Fetch flights for the requested period
    const flights = await prisma.flightLogbook.findMany({
      where: whereClause as any,
      include: {
        pilot1: {
          select: {
            id: true,
            firstname: true,
            lastname: true,
          }
        },
        pilot2: {
          select: {
            id: true,
            firstname: true,
            lastname: true,
          }
        },
        plane: {
          select: {
            id: true,
            registration_id: true,
            type: true,
            is_twoseater: true,
          }
        }
      },
    });

    // Function to process flights and generate statistics
    const processFlights = (flights: any[]) => {
      // Calculate total flights - only count flights that have actually started (with takeoff time)
      const totalFlights = flights.filter(f => f.takeoff_time).length;
      
      // Calculate flights in progress
      const flightsInProgress = flights.filter(f => 
        f.takeoff_time && !f.landing_time
      ).length;
      
      // Calculate completed flights
      const completedFlights = flights.filter(f => 
        f.takeoff_time && f.landing_time
      ).length;

      // Calculate total flight time in minutes
      let totalFlightTimeMinutes = 0;
      
      // Find the longest flight
      let longestFlight = null;
      let longestFlightDuration = 0;
      
      // Process detailed flight information for the flights tab
      const detailedFlights = flights.map(flight => {
        // Calculate duration if the flight has both takeoff and landing times
        let durationMinutes = 0;
        let formattedDuration = "-";
        
        if (flight.takeoff_time && flight.landing_time) {
          const takeoffTime = new Date(flight.takeoff_time);
          const landingTime = new Date(flight.landing_time);
          
          // Extract hours and minutes directly from Date objects
          const takeoffHour = takeoffTime.getHours();
          const takeoffMin = takeoffTime.getMinutes();
          const landingHour = landingTime.getHours();
          const landingMin = landingTime.getMinutes();
          
          // Calculate duration in minutes, handling possible overnight flights
          durationMinutes = (landingHour * 60 + landingMin) - (takeoffHour * 60 + takeoffMin);
          if (durationMinutes < 0) durationMinutes += 24 * 60; // Handle overnight flights
          
          // Format the duration
          const hours = Math.floor(durationMinutes / 60);
          const minutes = durationMinutes % 60;
          formattedDuration = `${hours}:${minutes.toString().padStart(2, '0')}`;
        }
        
        // Determine the flight status
        let status = "pending";
        if (flight.takeoff_time && !flight.landing_time) {
          status = "in_flight";
        } else if (flight.takeoff_time && flight.landing_time) {
          status = "completed";
        }
        
        // Format takeoff and landing times using the utility function
        // Ensure the date objects are indeed UTC before formatting
        const takeoffTime = flight.takeoff_time ? formatUTCDateToLocalTime(new Date(flight.takeoff_time)) : "-";
        const landingTime = flight.landing_time ? formatUTCDateToLocalTime(new Date(flight.landing_time)) : "-";
        
        // Get pilot information
        const pilot1Name = flight.pilot1 
          ? `${flight.pilot1.firstname} ${flight.pilot1.lastname}`
          : (flight.guest_pilot1_name || "-");
          
        const pilot2Name = flight.pilot2
          ? `${flight.pilot2.firstname} ${flight.pilot2.lastname}`
          : (flight.guest_pilot2_name || null);
        
        return {
          id: flight.id,
          registration: flight.plane ? flight.plane.registration_id : (flight.registration || "Unknown"),
          type: flight.plane ? flight.plane.type : (flight.type || "Unknown"),
          pilot: pilot1Name,
          coPilot: pilot2Name,
          takeoffTime: takeoffTime,
          landingTime: landingTime,
          duration: formattedDuration,
          durationMinutes: durationMinutes,
          status: status,
          isSchoolFlight: flight.is_school_flight || false,
          takeoffAirfield: flight.takeoff_airfield || "-",
          landingAirfield: flight.landing_airfield || "-",
          // Include new flight metrics
          distance: flight.flight_distance || null,
          maxAltitude: flight.max_altitude || null,
          maxSpeed: flight.max_speed || null
        };
      });
      
      // Sort detailed flights by takeoff time, most recent first
      const sortedFlights = [...detailedFlights].sort((a, b) => {
        // Handle flights without takeoff time - they should appear at the top
        const aTakeoff = a.takeoffTime;
        const bTakeoff = b.takeoffTime;

        if (aTakeoff === "-" && bTakeoff !== "-") return -1;
        if (aTakeoff !== "-" && bTakeoff === "-") return 1;
        if (aTakeoff === "-" && bTakeoff === "-") return 0;
        
        // For flights with takeoff time, sort by most recent first
        // At this point, aTakeoff and bTakeoff are guaranteed to be HH:MM strings
        const timeA = aTakeoff!.split(":"); 
        const timeB = bTakeoff!.split(":");
        
        const hourA = parseInt(timeA[0]);
        const hourB = parseInt(timeB[0]);
        
        if (hourA !== hourB) return hourB - hourA;
        
        const minA = parseInt(timeA[1]);
        const minB = parseInt(timeB[1]);
        
        return minB - minA;
      });
      
      flights.forEach(flight => {
        if (flight.takeoff_time && flight.landing_time) {
          // Update to use the same calculation method as in the PDF generator
          const takeoffTime = new Date(flight.takeoff_time);
          const landingTime = new Date(flight.landing_time);
          
          // Extract hours and minutes directly from Date objects
          const takeoffHour = takeoffTime.getHours();
          const takeoffMin = takeoffTime.getMinutes();
          const landingHour = landingTime.getHours();
          const landingMin = landingTime.getMinutes();
          
          // Calculate duration in minutes, handling possible overnight flights
          let durationMinutes = (landingHour * 60 + landingMin) - (takeoffHour * 60 + takeoffMin);
          if (durationMinutes < 0) durationMinutes += 24 * 60; // Handle overnight flights
          
          totalFlightTimeMinutes += durationMinutes;
          
          // Check if this is the longest flight
          if (durationMinutes > longestFlightDuration) {
            longestFlightDuration = durationMinutes;
            
            // Get pilot name
            let pilotName = '';
            let isGuestPilot = false;
            
            if (flight.pilot1) {
              pilotName = `${flight.pilot1.firstname} ${flight.pilot1.lastname}`;
              isGuestPilot = false;
            } else if (flight.guest_pilot1_name) {
              pilotName = flight.guest_pilot1_name;
              isGuestPilot = true;
            }
            
            // Get aircraft registration
            const aircraftRegistration = flight.plane 
              ? flight.plane.registration_id 
              : (flight.registration || 'Unknown');
            
            // Format the duration
            const hours = Math.floor(durationMinutes / 60);
            const minutes = durationMinutes % 60;
            const formattedDuration = `${hours} ${hours === 1 ? 'time' : 'timer'} ${minutes} ${minutes === 1 ? 'minut' : 'minutter'}`;
            
            longestFlight = {
              durationMinutes,
              formattedDuration,
              pilotName,
              isGuestPilot,
              aircraftRegistration,
              date: flight.takeoff_time ? new Date(flight.takeoff_time).toISOString() : undefined
            };
          }
        }
      });

      // Format as hours and minutes
      const totalFlightTimeHours = Math.floor(totalFlightTimeMinutes / 60);
      const totalFlightTimeRemainingMinutes = totalFlightTimeMinutes % 60;
      const totalFlightTime = `${totalFlightTimeHours}:${totalFlightTimeRemainingMinutes.toString().padStart(2, '0')}`;

      // Process pilot statistics
      const pilotStats: Record<string, any> = {};
      
      // Track overall flight records
      let recordDistance = {
        value: 0,
        pilotName: "",
        aircraftRegistration: ""
      };
      
      let recordAltitude = {
        value: 0,
        pilotName: "",
        aircraftRegistration: ""
      };
      
      let recordSpeed = {
        value: 0,
        pilotName: "",
        aircraftRegistration: ""
      };
      
      flights.forEach(flight => {
        const isSchoolFlight = flight.is_school_flight === true;
        
        // Track record metrics
        if (flight.flight_distance && flight.flight_distance > recordDistance.value) {
          const pilotName = flight.pilot1 
            ? `${flight.pilot1.firstname} ${flight.pilot1.lastname}` 
            : (flight.guest_pilot1_name || "Unknown Pilot");
            
          recordDistance = {
            value: flight.flight_distance,
            pilotName: pilotName,
            aircraftRegistration: flight.plane?.registration_id || flight.registration || "Unknown"
          };
        }
        
        if (flight.max_altitude && flight.max_altitude > recordAltitude.value) {
          const pilotName = flight.pilot1 
            ? `${flight.pilot1.firstname} ${flight.pilot1.lastname}` 
            : (flight.guest_pilot1_name || "Unknown Pilot");
            
          recordAltitude = {
            value: flight.max_altitude,
            pilotName: pilotName,
            aircraftRegistration: flight.plane?.registration_id || flight.registration || "Unknown"
          };
        }
        
        if (flight.max_speed && flight.max_speed > recordSpeed.value) {
          const pilotName = flight.pilot1 
            ? `${flight.pilot1.firstname} ${flight.pilot1.lastname}` 
            : (flight.guest_pilot1_name || "Unknown Pilot");
            
          recordSpeed = {
            value: flight.max_speed,
            pilotName: pilotName,
            aircraftRegistration: flight.plane?.registration_id || flight.registration || "Unknown"
          };
        }
        
        // Process pilot1
        if (flight.pilot1) {
          const pilotId = flight.pilot1.id;
          const pilotName = `${flight.pilot1.firstname} ${flight.pilot1.lastname}`;
          
          if (!pilotStats[pilotId]) {
            pilotStats[pilotId] = {
              id: pilotId,
              name: pilotName,
              isGuest: false,
              flightCount: 0,
              flightTimeMinutes: 0,
              instructorFlights: 0,
              studentFlights: 0,
              totalDistance: 0,
              maxAltitude: 0,
              maxSpeed: 0
            };
          }
          
          pilotStats[pilotId].flightCount++;
          
          // Add flight distance if available
          if (flight.flight_distance) {
            pilotStats[pilotId].totalDistance += flight.flight_distance;
          }
          
          // Track maximum altitude and speed
          if (flight.max_altitude && flight.max_altitude > pilotStats[pilotId].maxAltitude) {
            pilotStats[pilotId].maxAltitude = flight.max_altitude;
          }
          
          if (flight.max_speed && flight.max_speed > pilotStats[pilotId].maxSpeed) {
            pilotStats[pilotId].maxSpeed = flight.max_speed;
          }
          
          // Count school flights appropriately
          if (isSchoolFlight) {
            // For pilot1 in a school flight, they're typically the student
            pilotStats[pilotId].studentFlights++;
          }
          
          if (flight.takeoff_time && flight.landing_time) {
            // Update to use the same calculation method as above
            const takeoffTime = new Date(flight.takeoff_time);
            const landingTime = new Date(flight.landing_time);
            
            // Extract hours and minutes directly from Date objects
            const takeoffHour = takeoffTime.getHours();
            const takeoffMin = takeoffTime.getMinutes();
            const landingHour = landingTime.getHours();
            const landingMin = landingTime.getMinutes();
            
            // Calculate duration in minutes, handling possible overnight flights
            let durationMinutes = (landingHour * 60 + landingMin) - (takeoffHour * 60 + takeoffMin);
            if (durationMinutes < 0) durationMinutes += 24 * 60; // Handle overnight flights
            
            pilotStats[pilotId].flightTimeMinutes += durationMinutes;
          }
        } else if (flight.guest_pilot1_name) {
          // Process guest pilot1 - Normalize the name to handle case insensitivity
          const normalizedName = flight.guest_pilot1_name.trim().toLowerCase();
          const guestId = `guest_${normalizedName}`;
          
          if (!pilotStats[guestId]) {
            pilotStats[guestId] = {
              id: guestId,
              name: flight.guest_pilot1_name.trim(), // Keep original casing for display
              isGuest: true,
              flightCount: 0,
              flightTimeMinutes: 0,
              instructorFlights: 0,
              studentFlights: 0,
              totalDistance: 0,
              maxAltitude: 0,
              maxSpeed: 0
            };
          }
          
          pilotStats[guestId].flightCount++;
          
          // Add flight distance if available
          if (flight.flight_distance) {
            pilotStats[guestId].totalDistance += flight.flight_distance;
          }
          
          // Track maximum altitude and speed
          if (flight.max_altitude && flight.max_altitude > pilotStats[guestId].maxAltitude) {
            pilotStats[guestId].maxAltitude = flight.max_altitude;
          }
          
          if (flight.max_speed && flight.max_speed > pilotStats[guestId].maxSpeed) {
            pilotStats[guestId].maxSpeed = flight.max_speed;
          }
          
          // Count school flights appropriately
          if (isSchoolFlight) {
            pilotStats[guestId].studentFlights++;
          }
          
          if (flight.takeoff_time && flight.landing_time) {
            // Update to use the same calculation method as above
            const takeoffTime = new Date(flight.takeoff_time);
            const landingTime = new Date(flight.landing_time);
            
            // Extract hours and minutes directly from Date objects
            const takeoffHour = takeoffTime.getHours();
            const takeoffMin = takeoffTime.getMinutes();
            const landingHour = landingTime.getHours();
            const landingMin = landingTime.getMinutes();
            
            // Calculate duration in minutes, handling possible overnight flights
            let durationMinutes = (landingHour * 60 + landingMin) - (takeoffHour * 60 + takeoffMin);
            if (durationMinutes < 0) durationMinutes += 24 * 60; // Handle overnight flights
            
            pilotStats[guestId].flightTimeMinutes += durationMinutes;
          }
        }
        
        // Process pilot2
        if (flight.pilot2) {
          const pilotId = flight.pilot2.id;
          const pilotName = `${flight.pilot2.firstname} ${flight.pilot2.lastname}`;
          
          if (!pilotStats[pilotId]) {
            pilotStats[pilotId] = {
              id: pilotId,
              name: pilotName,
              isGuest: false,
              flightCount: 0,
              flightTimeMinutes: 0,
              instructorFlights: 0,
              studentFlights: 0,
              totalDistance: 0,
              maxAltitude: 0,
              maxSpeed: 0
            };
          }
          
          pilotStats[pilotId].flightCount++;
          
          // Add flight distance if available
          if (flight.flight_distance) {
            pilotStats[pilotId].totalDistance += flight.flight_distance;
          }
          
          // Track maximum altitude and speed
          if (flight.max_altitude && flight.max_altitude > pilotStats[pilotId].maxAltitude) {
            pilotStats[pilotId].maxAltitude = flight.max_altitude;
          }
          
          if (flight.max_speed && flight.max_speed > pilotStats[pilotId].maxSpeed) {
            pilotStats[pilotId].maxSpeed = flight.max_speed;
          }
          
          // Count school flights appropriately
          if (isSchoolFlight) {
            // For pilot2 in a school flight, they're typically the instructor
            pilotStats[pilotId].instructorFlights++;
          }
          
          if (flight.takeoff_time && flight.landing_time) {
            // Update to use the same calculation method as above
            const takeoffTime = new Date(flight.takeoff_time);
            const landingTime = new Date(flight.landing_time);
            
            // Extract hours and minutes directly from Date objects
            const takeoffHour = takeoffTime.getHours();
            const takeoffMin = takeoffTime.getMinutes();
            const landingHour = landingTime.getHours();
            const landingMin = landingTime.getMinutes();
            
            // Calculate duration in minutes, handling possible overnight flights
            let durationMinutes = (landingHour * 60 + landingMin) - (takeoffHour * 60 + takeoffMin);
            if (durationMinutes < 0) durationMinutes += 24 * 60; // Handle overnight flights
            
            pilotStats[pilotId].flightTimeMinutes += durationMinutes;
          }
        } else if (flight.guest_pilot2_name) {
          // Process guest pilot2 - Normalize the name to handle case insensitivity
          const normalizedName = flight.guest_pilot2_name.trim().toLowerCase();
          const guestId = `guest_${normalizedName}`;
          
          if (!pilotStats[guestId]) {
            pilotStats[guestId] = {
              id: guestId,
              name: flight.guest_pilot2_name.trim(), // Keep original casing for display
              isGuest: true,
              flightCount: 0,
              flightTimeMinutes: 0,
              instructorFlights: 0,
              studentFlights: 0,
              totalDistance: 0,
              maxAltitude: 0,
              maxSpeed: 0
            };
          }
          
          pilotStats[guestId].flightCount++;
          
          // Add flight distance if available
          if (flight.flight_distance) {
            pilotStats[guestId].totalDistance += flight.flight_distance;
          }
          
          // Track maximum altitude and speed
          if (flight.max_altitude && flight.max_altitude > pilotStats[guestId].maxAltitude) {
            pilotStats[guestId].maxAltitude = flight.max_altitude;
          }
          
          if (flight.max_speed && flight.max_speed > pilotStats[guestId].maxSpeed) {
            pilotStats[guestId].maxSpeed = flight.max_speed;
          }
          
          // Count school flights appropriately
          if (isSchoolFlight) {
            pilotStats[guestId].instructorFlights++;
          }
          
          if (flight.takeoff_time && flight.landing_time) {
            // Update to use the same calculation method as above
            const takeoffTime = new Date(flight.takeoff_time);
            const landingTime = new Date(flight.landing_time);
            
            // Extract hours and minutes directly from Date objects
            const takeoffHour = takeoffTime.getHours();
            const takeoffMin = takeoffTime.getMinutes();
            const landingHour = landingTime.getHours();
            const landingMin = landingTime.getMinutes();
            
            // Calculate duration in minutes, handling possible overnight flights
            let durationMinutes = (landingHour * 60 + landingMin) - (takeoffHour * 60 + takeoffMin);
            if (durationMinutes < 0) durationMinutes += 24 * 60; // Handle overnight flights
            
            pilotStats[guestId].flightTimeMinutes += durationMinutes;
          }
        }
      });
      
      // Format pilot flight times and sort by flight count
      const formattedPilotStats = Object.values(pilotStats).map((pilot: any) => {
        const hours = Math.floor(pilot.flightTimeMinutes / 60);
        const minutes = pilot.flightTimeMinutes % 60;
        return {
          ...pilot,
          flightTime: `${hours}:${minutes.toString().padStart(2, '0')}`,
          flightHours: hours,
          flightMinutes: minutes
        };
      }).sort((a: any, b: any) => b.flightCount - a.flightCount);

      // Process aircraft statistics
      const aircraftStats: Record<string, any> = {};
      
      flights.forEach(flight => {
        let uniqueAircraftKey: string;
        let registrationId: string;
        let aircraftType: string;
        let aircraftObjectId: string | undefined = undefined; // Store the actual plane ObjectId if available

        if (flight.plane) {
          registrationId = flight.plane.registration_id;
          aircraftType = flight.plane.type;
          uniqueAircraftKey = registrationId; // Group by registration
          aircraftObjectId = flight.plane.id; // Keep track of the ObjectId if we have it
        } else if (flight.registration) {
          registrationId = flight.registration;
          aircraftType = flight.type || 'Unknown';
          uniqueAircraftKey = registrationId; // Group by registration
        } else {
          // This case should be rare: flight has no plane link and no registration on the logbook entry itself
          // We'll create a unique key based on the flight ID to avoid losing these stats, 
          // but they won't group with other flights of the same physical aircraft.
          uniqueAircraftKey = `unknown_aircraft_flight_${flight.id}`;
          registrationId = 'Unknown Reg';
          aircraftType = flight.type || 'Unknown Type';
        }
        
        if (!aircraftStats[uniqueAircraftKey]) {
          aircraftStats[uniqueAircraftKey] = {
            // Use the uniqueAircraftKey (registration) for the id field for stable UI keys
            // And store the actual plane.id if available, otherwise, it can be the registration or generated key
            id: aircraftObjectId || uniqueAircraftKey, 
            registration: registrationId,
            type: aircraftType,
            flightCount: 0,
            flightTimeMinutes: 0,
            schoolFlightCount: 0
          };
        }
        
        aircraftStats[uniqueAircraftKey].flightCount++;
        
        // Count school flights
        if (flight.is_school_flight) {
          aircraftStats[uniqueAircraftKey].schoolFlightCount++;
        }
        
        if (flight.takeoff_time && flight.landing_time) {
          const takeoffTime = new Date(flight.takeoff_time);
          const landingTime = new Date(flight.landing_time);
          
          // Extract hours and minutes directly from Date objects - same method used in PDF generation
          const takeoffHour = takeoffTime.getHours();
          const takeoffMin = takeoffTime.getMinutes();
          const landingHour = landingTime.getHours();
          const landingMin = landingTime.getMinutes();
          
          // Calculate duration in minutes, handling possible overnight flights
          let durationMinutes = (landingHour * 60 + landingMin) - (takeoffHour * 60 + takeoffMin);
          if (durationMinutes < 0) durationMinutes += 24 * 60; // Handle overnight flights
          
          aircraftStats[uniqueAircraftKey].flightTimeMinutes += durationMinutes;
        }
      });
      
      // Format aircraft flight times and sort by flight count
      const formattedAircraftStats = Object.values(aircraftStats).map((aircraft: any) => {
        const hours = Math.floor(aircraft.flightTimeMinutes / 60);
        const minutes = aircraft.flightTimeMinutes % 60;
        return {
          ...aircraft,
          flightTime: `${hours}:${minutes.toString().padStart(2, '0')}`,
          flightHours: hours,
          flightMinutes: minutes
        };
      }).sort((a: any, b: any) => b.flightCount - a.flightCount);

      return {
        summary: {
          totalFlights,
          flightsInProgress,
          completedFlights,
          totalFlightTime,
          totalFlightTimeMinutes: totalFlightTimeMinutes,
          totalFlightTimeHours: totalFlightTimeHours,
          totalFlightTimeRemainingMinutes: totalFlightTimeRemainingMinutes
        },
        pilots: formattedPilotStats,
        aircraft: formattedAircraftStats,
        longestFlight: longestFlight,
        flights: sortedFlights,
        records: {
          distance: recordDistance.value > 0 ? recordDistance : null,
          altitude: recordAltitude.value > 0 ? recordAltitude : null,
          speed: recordSpeed.value > 0 ? recordSpeed : null
        }
      };
    };

    // Process statistics for the requested period
    const periodStats = processFlights(flights);

    // Create response based on requested period
    const response: any = {
      success: true,
      date: targetDate.toISOString().split('T')[0],
    };
    
    if (period === 'today') {
      response.today = periodStats;
    } else {
      response.year = periodStats;
    }

    return NextResponse.json(response);
    
  } catch (error) {
    console.error('Error fetching statistics:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch statistics' },
      { status: 500 }
    );
  }
} 