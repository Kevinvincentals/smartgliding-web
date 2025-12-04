import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { renderToBuffer } from '@react-pdf/renderer';
import { createFlightListPdf } from '@/components/reports/server-pdf-generator';
import { 
  formatUTCToLocalTime,
  getStartOfTimezoneDayUTC,
  getEndOfTimezoneDayUTC 
} from '@/lib/time-utils';

export async function GET(request: Request) {
  try {
    // Get Club ID from JWT payload in headers
    const jwtPayloadHeader = request.headers.get('x-jwt-payload');

    if (!jwtPayloadHeader) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized: Missing JWT payload.' },
        { status: 401 }
      );
    }

    let clubIdFromToken: string;
    try {
      const jwtPayload = JSON.parse(jwtPayloadHeader);
      if (!jwtPayload.clubId) {
        throw new Error('clubId missing from JWT payload');
      }
      clubIdFromToken = jwtPayload.clubId;
    } catch (e) {
      console.error("Error parsing JWT payload or missing clubId:", e);
      return NextResponse.json(
        { success: false, error: 'Unauthorized: Invalid JWT payload.' },
        { status: 401 }
      );
    }

    // Fetch the club information including homefield
    let clubName = 'Ukendt Klub'; // Default club name
    let clubHomefield = null;
    if (clubIdFromToken) {
      const club = await prisma.club.findUnique({
        where: { id: clubIdFromToken },
        select: { name: true, homefield: true },
      });
      if (club?.name) {
        clubName = club.name;
        clubHomefield = club.homefield;
      }
    }

    // Parse JWT payload again for consistency
    const jwtPayload = JSON.parse(jwtPayloadHeader);

    // Get date from query parameters or use today's date
    const url = new URL(request.url);
    const dateParam = url.searchParams.get('date');

    let date = new Date();
    if (dateParam) {
      date = new Date(dateParam);
      // If invalid date, use today
      if (isNaN(date.getTime())) {
        date = new Date();
      }
    }

    // Calculate the date range for the requested day
    const startOfDay = getStartOfTimezoneDayUTC(date);
    const endOfDay = getEndOfTimezoneDayUTC(date);

    // Fetch daily info for the selected day and club
    const dailyInfo = await prisma.dailyInfo.findFirst({
      where: {
        date: {
          gte: startOfDay,
          lte: endOfDay
        },
        clubId: clubIdFromToken, // Filter by clubId
      },
      include: {
        trafficLeader: {
          select: {
            id: true,
            firstname: true,
            lastname: true,
          }
        },
        trafficLeader2: {
          select: {
            id: true,
            firstname: true,
            lastname: true,
          }
        },
        towPerson: {
          select: {
            id: true,
            firstname: true,
            lastname: true,
          }
        },
        towPerson2: {
          select: {
            id: true,
            firstname: true,
            lastname: true,
          }
        }
      }
    });

    // Format traffic leader and tow person names
    let trafficLeaderName = '';
    let towPersonName = '';

    if (dailyInfo?.trafficLeader) {
      trafficLeaderName = `${dailyInfo.trafficLeader.firstname} ${dailyInfo.trafficLeader.lastname}`;
      
      // Add second traffic leader if exists
      if (dailyInfo?.trafficLeader2) {
        trafficLeaderName += ` / ${dailyInfo.trafficLeader2.firstname} ${dailyInfo.trafficLeader2.lastname}`;
      }
    }

    if (dailyInfo?.towPerson) {
      towPersonName = `${dailyInfo.towPerson.firstname} ${dailyInfo.towPerson.lastname}`;
      
      // Add second tow person if exists
      if (dailyInfo?.towPerson2) {
        towPersonName += ` / ${dailyInfo.towPerson2.firstname} ${dailyInfo.towPerson2.lastname}`;
      }
    }

    // Build the flight query filter using same logic as working statistics endpoint
    const dateConditions = {
      OR: [
        // Flights that took off on the requested day
        {
          takeoff_time: {
            gte: startOfDay,
            lte: endOfDay
          }
        },
        // Flights that landed on the requested day
        {
          landing_time: {
            gte: startOfDay,
            lte: endOfDay
          }
        },
        // Flights created on the requested day (including those without takeoff/landing times)
        {
          createdAt: {
            gte: startOfDay,
            lte: endOfDay
          }
        }
      ]
    };

    const flightFilter: any = {
      AND: [
        // Date conditions
        dateConditions,
        // Not deleted
        { deleted: false },
        // Only include flights that have actually happened (INFLIGHT, LANDED, or COMPLETED)
        {
          status: {
            in: ['INFLIGHT', 'LANDED', 'COMPLETED']
          }
        }
      ],
      // Either match club OR match airfield (same logic as fetch_statistics)
      OR: [
        // Either clubId matches
        { clubId: clubIdFromToken },
        // OR the airfield matches our homefield (either takeoff or landing)
        ...(clubHomefield ? [
          {
            OR: [
              { takeoff_airfield: clubHomefield },
              { landing_airfield: clubHomefield }
            ]
          }
        ] : [])
      ]
    };

    // Fetch flights for the specified day
    const flights = await prisma.flightLogbook.findMany({
      where: flightFilter,
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
          }
        },
        club: {
          select: {
            id: true,
            name: true,
            homefield: true
          }
        }
      },
      orderBy: {
        takeoff_time: 'asc'
      }
    });

    // Calculate statistics
    
    // Calculate total flight time in minutes - reset it first
    let totalFlightTimeMinutes = 0;
    
    // Calculate flight statistics per aircraft
    const aircraftStats: Record<string, {
      registration: string,
      type: string, // Added type for consistency
      flightCount: number,
      flightTimeMinutes: number
    }> = {};

    flights.forEach(flight => {
      // Skip duration calculation for total stats - we'll calculate it separately for consistency
      
      // Track aircraft statistics - updated logic
      let uniqueAircraftKey: string;
      let registrationDisplay: string;
      let aircraftTypeDisplay: string;

      if (flight.plane) {
        registrationDisplay = flight.plane.registration_id;
        aircraftTypeDisplay = flight.plane.type || 'Ukendt';
        uniqueAircraftKey = registrationDisplay; // Group by registration
      } else if (flight.registration) {
        registrationDisplay = flight.registration;
        aircraftTypeDisplay = flight.type || 'Ukendt';
        uniqueAircraftKey = registrationDisplay; // Group by registration
      } else {
        // Fallback for flights with no registration information on logbook or plane
        // These will be grouped under a generic key, but it's better than ignoring them.
        uniqueAircraftKey = `unknown_aircraft_flight_${flight.id}`;
        registrationDisplay = 'Ukendt Reg';
        aircraftTypeDisplay = flight.type || 'Ukendt Type';
      }
      
      // Only count flights with duration for aircraft flight time, but always count starts
      if (!aircraftStats[uniqueAircraftKey]) {
        aircraftStats[uniqueAircraftKey] = {
          registration: registrationDisplay,
          type: aircraftTypeDisplay,
          flightCount: 0,
          flightTimeMinutes: 0
        };
      }
      
      aircraftStats[uniqueAircraftKey].flightCount++;
      
      // Calculate and add flight time if both times exist
      if (flight.takeoff_time && flight.landing_time) {
        // We must use the SAME duration calculation as we use for individual flights
        const takeoffTime = new Date(flight.takeoff_time);
        const landingTime = new Date(flight.landing_time);
        
        // Extract hours and minutes directly from Date objects - same as in flightData calculation
        const takeoffHour = takeoffTime.getHours();
        const takeoffMin = takeoffTime.getMinutes();
        const landingHour = landingTime.getHours();
        const landingMin = landingTime.getMinutes();
        
        // Calculate duration in minutes, handling possible overnight flights
        let flightDurationMinutes = (landingHour * 60 + landingMin) - (takeoffHour * 60 + takeoffMin);
        if (flightDurationMinutes < 0) flightDurationMinutes += 24 * 60; // Handle overnight flights
        
        // Add this duration to the aircraft stats
        aircraftStats[uniqueAircraftKey].flightTimeMinutes += flightDurationMinutes;
        
        // Also add to total flight time
        totalFlightTimeMinutes += flightDurationMinutes;
      }
    });

    // Format time with colon separator using our time-utils
    const formatTimeWithColon = (dateString: string): string => {
      // Convert UTC time to Danish local time
      const localTime = formatUTCToLocalTime(dateString);
      return localTime || '-';
    };

    // Format airfield display
    const formatAirfields = (takeoffAirfield: string, landingAirfield: string | null) => {
      // If no landing field yet (flight in progress), show only takeoff
      if (!landingAirfield) {
        return takeoffAirfield;
      }
      // Display as "takeoff/landing"
      return `${takeoffAirfield}/${landingAirfield}`;
    };

    // Format flight data for PDF generation
    const flightData = flights.map((flight, index) => {
      // Format pilot names - include club name for external flights
      const isExternalFlight = flight.clubId !== clubIdFromToken;
      
      const pilot1Name = flight.pilot1 
        ? `${flight.pilot1.firstname} ${flight.pilot1.lastname}`
        : (flight.guest_pilot1_name || 'N/A');
        
      const pilot2Name = flight.pilot2 
        ? `${flight.pilot2.firstname} ${flight.pilot2.lastname}`
        : (flight.guest_pilot2_name || '-');
        
      // Add club name for external flights
      const clubSuffix = isExternalFlight && flight.club?.name ? ` (${flight.club.name})` : '';
      const pilot1DisplayName = pilot1Name + clubSuffix;
      const pilot2DisplayName = pilot2Name === '-' ? '-' : pilot2Name + clubSuffix;
      
      // Calculate flight time if available - EXACT SAME CALCULATION as in flight-card component
      let flightTimeText = '-';
      if (flight.takeoff_time && flight.landing_time) {
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
        
        // Format as hours:minutes
        const hours = Math.floor(durationMinutes / 60);
        const minutes = durationMinutes % 60;
        
        flightTimeText = `${hours}:${minutes.toString().padStart(2, '0')}`;
      }
      
      // Get airfield information - don't assume landing field if not landed
      const takeoffAirfield = flight.takeoff_airfield || 'EKFS';
      const landingAirfield = flight.landing_airfield || undefined;
      
      return {
        number: index + 1, // Flight number (1-indexed)
        registration: flight.plane ? flight.plane.registration_id : (flight.registration || 'N/A'),
        type: flight.plane ? flight.plane.type : (flight.type || '-'),
        pilot1: pilot1DisplayName,
        pilot2: pilot2DisplayName,
        isSchoolFlight: flight.is_school_flight || false,
        takeoffTime: flight.takeoff_time ? formatTimeWithColon(flight.takeoff_time.toISOString()) : '-',
        landingTime: flight.landing_time ? formatTimeWithColon(flight.landing_time.toISOString()) : '-',
        flightTime: flightTimeText,
        launchMethod: flight.launch_method || '-',
        takeoffAirfield,
        landingAirfield,
        feltDisplay: formatAirfields(takeoffAirfield, landingAirfield ?? null)
      };
    });
    
    // Format aircraft statistics
    const aircraftStatsList = Object.values(aircraftStats).map(stats => {
      const hours = Math.floor(stats.flightTimeMinutes / 60);
      const minutes = stats.flightTimeMinutes % 60;
      return {
        registration: stats.registration,
        flightCount: stats.flightCount,
        flightTime: `${hours}:${minutes.toString().padStart(2, '0')}`
      };
    });

    // Create the PDF document
    const pdfDoc = createFlightListPdf({
      date: date.toLocaleDateString('da-DK', { 
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      }),
      flights: flightData,
      totalFlights: flights.length,
      aircraftStats: aircraftStatsList,
      trafficLeader: trafficLeaderName,
      towPerson: towPersonName,
      clubName: clubName // Pass fetched clubName
    });

    // Convert the PDF to a buffer
    const buffer = await renderToBuffer(pdfDoc);

    // Format date for the filename
    const formattedDate = date.toISOString().split('T')[0];
    
    // Return the PDF buffer (convert to Uint8Array for Next.js 16 compatibility)
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="startliste-${formattedDate}.pdf"`
      }
    });
  } catch (error) {
    console.error('Error generating PDF:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to generate PDF' },
      { status: 500 }
    );
  }
} 