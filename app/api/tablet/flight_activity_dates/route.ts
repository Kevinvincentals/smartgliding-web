import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getStartOfTimezoneDayUTC, getEndOfTimezoneDayUTC } from '@/lib/time-utils';

/**
 * API endpoint to fetch dates with flight activity for a given year
 * Used by calendars to show visual indicators on dates with flights
 * Returns all dates in the year that have at least one flight
 */
export async function GET(request: NextRequest) {
  try {
    // Get JWT payload from headers (set by middleware)
    const jwtPayloadString = request.headers.get('x-jwt-payload');
    const jwtPayload = jwtPayloadString ? JSON.parse(jwtPayloadString) : null;
    const clubId = jwtPayload?.clubId || jwtPayload?.id;

    if (!clubId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get query parameters
    const { searchParams } = new URL(request.url);
    const yearParam = searchParams.get('year');

    if (!yearParam) {
      return NextResponse.json(
        { success: false, error: 'Year parameter is required' },
        { status: 400 }
      );
    }

    const year = parseInt(yearParam);

    if (isNaN(year)) {
      return NextResponse.json(
        { success: false, error: 'Invalid year' },
        { status: 400 }
      );
    }

    // Calculate the start and end of the year in UTC
    const startOfYear = getStartOfTimezoneDayUTC(new Date(year, 0, 1)); // January 1st
    const endOfYear = getEndOfTimezoneDayUTC(new Date(year, 11, 31)); // December 31st

    // Fetch all flights for the club in this year that have takeoff_time
    const flights = await prisma.flightLogbook.findMany({
      where: {
        clubId,
        deleted: { not: true },
        takeoff_time: {
          gte: startOfYear,
          lte: endOfYear
        }
      },
      select: {
        takeoff_time: true
      }
    });

    // Extract unique dates (in local timezone)
    const datesSet = new Set<string>();
    flights.forEach(flight => {
      if (flight.takeoff_time) {
        const date = flight.takeoff_time;

        // Convert UTC date to local date components
        const offsetHours = date.getUTCHours() >= 22 ? 1 :
                           date.getUTCHours() >= 21 ? 2 :
                           date.getUTCHours() === 0 || date.getUTCHours() === 1 ? -1 : 0;

        const localDate = new Date(date.getTime() + (offsetHours * 60 * 60 * 1000));

        // Format as YYYY-MM-DD
        const year = localDate.getUTCFullYear();
        const month = String(localDate.getUTCMonth() + 1).padStart(2, '0');
        const day = String(localDate.getUTCDate()).padStart(2, '0');
        const dateStr = `${year}-${month}-${day}`;

        datesSet.add(dateStr);
      }
    });

    // Convert Set to sorted array
    const dates = Array.from(datesSet).sort();

    return NextResponse.json({
      success: true,
      dates,
      count: dates.length
    });

  } catch (error: any) {
    console.error('Error fetching flight activity dates:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error: ' + error.message },
      { status: 500 }
    );
  }
}
