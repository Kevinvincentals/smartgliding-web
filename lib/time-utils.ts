/**
 * Time utility functions with configurable timezone handling
 * Uses environment variable TIMEZONE to determine the target timezone
 * Defaults to Europe/Copenhagen if not specified
 */

// Get timezone from environment variable with fallback
const TIMEZONE = process.env.TIMEZONE || 'Europe/Copenhagen';

// Constants for handling European time zones (CET/CEST)
// In summer (Mar-Oct): Central European Summer Time (CEST) = UTC+2
// In winter (Oct-Mar): Central European Time (CET) = UTC+1

/**
 * Determine if the current date is in summer time (CEST) or winter time (CET)
 * Uses Intl.DateTimeFormat to properly detect DST transitions
 * @returns Hours offset from UTC (2 for summer CEST, 1 for winter CET)
 */
export function getCurrentTimezoneOffset(): number {
  // Use Intl.DateTimeFormat to get the actual timezone offset
  // This properly handles DST transitions (last Sunday of March/October for Europe)
  const now = new Date();

  // Get the timezone offset in minutes for the configured timezone
  // We do this by formatting a date in both UTC and the target timezone,
  // then comparing the hours to determine the offset
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE,
    hour: 'numeric',
    hour12: false,
    timeZoneName: 'shortOffset'
  });

  const parts = formatter.formatToParts(now);
  const timeZoneOffset = parts.find(part => part.type === 'timeZoneName')?.value;

  // Parse the offset (e.g., "GMT+1" or "GMT+2")
  if (timeZoneOffset) {
    const match = timeZoneOffset.match(/GMT([+-]\d+)/);
    if (match) {
      return Math.abs(parseInt(match[1]));
    }
  }

  // Fallback: compare UTC hours with local hours
  const utcHours = now.getUTCHours();
  const localHours = parseInt(new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE,
    hour: 'numeric',
    hour12: false
  }).format(now));

  let offset = localHours - utcHours;

  // Handle day boundary crossing
  if (offset > 12) offset -= 24;
  if (offset < -12) offset += 24;

  return Math.abs(offset);
}

/**
 * Converts a local time string (HH:MM) to a UTC Date object with a fixed offset
 * This ensures that a time like "16:14" in the configured timezone is correctly stored as UTC
 * 
 * @param timeString Time string in format "HH:MM" representing local time in configured timezone
 * @returns Date object in UTC that corresponds to the local time
 */
export function localTimeStringToUTC(timeString: string): Date | null {
  try {
    // Parse the time string
    const [hours, minutes] = timeString.split(':').map(Number);
    if (isNaN(hours) || isNaN(minutes)) {
      console.error('Invalid time format. Expected HH:MM');
      return null;
    }
    
    // Get current date components
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const day = now.getDate();
    
    // Get the explicit timezone offset for the configured timezone
    const offsetHours = getCurrentTimezoneOffset();
    
    // Calculate UTC hours by subtracting the timezone offset
    let utcHours = hours - offsetHours;
    const utcMinutes = minutes;
    
    // Handle day boundary for negative hours
    let utcDay = day;
    let utcMonth = month;
    let utcYear = year;
    
    // Handle hour underflow (crossing to previous day)
    if (utcHours < 0) {
      utcHours += 24;
      utcDay -= 1;
      
      // Handle month boundary when day goes negative
      if (utcDay < 1) {
        utcMonth -= 1;
        if (utcMonth < 0) {
          utcMonth = 11; // December
          utcYear -= 1;
        }
        // Get last day of previous month
        utcDay = new Date(utcYear, utcMonth + 1, 0).getDate();
      }
    }
    
    // Create a UTC date explicitly
    const utcDate = new Date(Date.UTC(
      utcYear,
      utcMonth,
      utcDay,
      utcHours,
      utcMinutes
    ));
    
    return utcDate;
  } catch (error) {
    console.error('Error converting time to UTC:', error);
    return null;
  }
}

/**
 * Formats a UTC date string to local time in the configured timezone (HH:MM)
 * This converts UTC time from the database to local time for display
 * 
 * @param dateString UTC date string from the database
 * @returns Formatted local time string (HH:MM) or null if input is invalid
 */
export function formatUTCToLocalTime(dateString: string | null): string | null {
  if (!dateString) return null;
  
  try {
    // Parse the UTC date string
    const utcDate = new Date(dateString);
    
    // Get the explicit timezone offset for the configured timezone
    const offsetHours = getCurrentTimezoneOffset();
    
    // Get UTC hours and minutes
    const utcHours = utcDate.getUTCHours();
    const utcMinutes = utcDate.getUTCMinutes();
    
    // Calculate local time by adding the offset
    let localHours = utcHours + offsetHours;
    const localMinutes = utcMinutes;
    
    // Handle hour overflow (crossing to next day)
    if (localHours >= 24) {
      localHours -= 24;
    }
    
    // Format the time string
    const formattedTime = `${localHours.toString().padStart(2, '0')}:${localMinutes.toString().padStart(2, '0')}`;
    
    return formattedTime;
  } catch (error) {
    console.error('Error formatting UTC to local time:', error);
    return null;
  }
}

/**
 * Formats a UTC Date object to local time in the configured timezone (HH:MM)
 * 
 * @param utcDate UTC Date object
 * @returns Formatted local time string (HH:MM) or null if input is invalid
 */
export function formatUTCDateToLocalTime(utcDate: Date | null): string | null {
  if (!utcDate) return null;
  
  try {
    // Get the explicit timezone offset for the configured timezone
    const offsetHours = getCurrentTimezoneOffset();
    
    // Get UTC hours and minutes
    const utcHours = utcDate.getUTCHours();
    const utcMinutes = utcDate.getUTCMinutes();
    
    // Calculate local time by adding the offset
    let localHours = utcHours + offsetHours;
    const localMinutes = utcMinutes;
    
    // Handle hour overflow (crossing to next day)
    if (localHours >= 24) {
      localHours -= 24;
    }
    
    // Format the time string
    const formattedTime = `${localHours.toString().padStart(2, '0')}:${localMinutes.toString().padStart(2, '0')}`;
    
    return formattedTime;
  } catch (error) {
    console.error('Error formatting UTC Date to local time:', error);
    return null;
  }
}

/**
 * Gets the start of a given local day in the configured timezone, expressed as a UTC Date object.
 * For example, if it's June 10th 15:00 in the configured timezone (CEST, UTC+2),
 * this will return a UTC Date for June 10th 00:00:00 CEST, which is June 9th 22:00:00 UTC.
 * 
 * @param date Optional Date object (defaults to current date/time). The time part of this date is ignored, only year, month, day are used as per local timezone interpretation.
 * @returns Date object representing the start of the local day in UTC.
 */
export function getStartOfTimezoneDayUTC(date: Date = new Date()): Date {
  const offsetHours = getCurrentTimezoneOffset();
  
  // Create a date in local time at 00:00:00
  // To do this, we take the input date's year, month, and day as if they were local.
  // Then, we construct a UTC date from these components, and subtract the timezone offset to get the true UTC start.

  // Get year, month, day components from the input date, treating them as local date parts.
  // This requires a bit of a trick: convert the input date to a string in the configured timezone, then parse those date parts.
  const formatter = new Intl.DateTimeFormat('en-CA', { // en-CA gives YYYY-MM-DD
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const [year, month, day] = formatter.formatToParts(date)
    .filter(part => part.type !== 'literal')
    .map(part => parseInt(part.value));

  // Construct a new Date object in UTC using these local date parts at 00:00:00 local time
  // Then, adjust for the offset to get the actual UTC equivalent of 00:00:00 local time.
  const localStartOfDay = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0)); // Local 00:00:00 interpreted as UTC
  
  // Subtract the timezone offset from this to get the true UTC time for local 00:00:00
  const startOfDayUTC = new Date(localStartOfDay.getTime() - (offsetHours * 60 * 60 * 1000));
  
  return startOfDayUTC;
}

/**
 * Gets the end of a given local day in the configured timezone, expressed as a UTC Date object.
 * For example, if it's June 10th 15:00 in the configured timezone (CEST, UTC+2),
 * this will return a UTC Date for June 10th 23:59:59.999 CEST, which is June 10th 21:59:59.999 UTC.
 * 
 * @param date Optional Date object (defaults to current date/time). The time part of this date is ignored.
 * @returns Date object representing the end of the local day in UTC.
 */
export function getEndOfTimezoneDayUTC(date: Date = new Date()): Date {
  const offsetHours = getCurrentTimezoneOffset();

  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const [year, month, day] = formatter.formatToParts(date)
    .filter(part => part.type !== 'literal')
    .map(part => parseInt(part.value));

  // Construct a new Date object in UTC using these local date parts at 23:59:59.999 local time
  // Then, adjust for the offset.
  const localEndOfDay = new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999)); // Local 23:59:59.999 interpreted as UTC
  
  // Subtract the timezone offset
  const endOfDayUTC = new Date(localEndOfDay.getTime() - (offsetHours * 60 * 60 * 1000));
  
  return endOfDayUTC;
}

/**
 * Gets the start of a given local year in the configured timezone, expressed as a UTC Date object.
 * This will be January 1st, 00:00:00 local time of the year of the given date, expressed in UTC.
 * 
 * @param date Optional Date object (defaults to current date/time). The year part of this date is used.
 * @returns Date object representing the start of the local year in UTC.
 */
export function getStartOfTimezoneYearUTC(date: Date = new Date()): Date {
  const offsetHours = getCurrentTimezoneOffset();

  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    // We only need the year to determine the start of that year
  });
  const year = parseInt(formatter.formatToParts(date).find(part => part.type === 'year')!.value);

  // Construct a new Date object in UTC for January 1st, 00:00:00 of the local year
  const localStartOfYear = new Date(Date.UTC(year, 0, 1, 0, 0, 0, 0)); // Jan 1st 00:00:00 of local year, interpreted as UTC
  
  // Subtract the timezone offset
  const startOfYearUTC = new Date(localStartOfYear.getTime() - (offsetHours * 60 * 60 * 1000));
  
  return startOfYearUTC;
}

/**
 * Gets the current date in the configured timezone
 * This is useful to avoid ambiguity around midnight when determining "today"
 *
 * @returns Date object representing the current moment in the configured timezone
 */
export function getCurrentTimezoneDate(): Date {
  // Create a new date representing the current moment in the configured timezone
  const now = new Date();

  // Get the current local time components in the configured timezone
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });

  const parts = formatter.formatToParts(now);
  const year = parseInt(parts.find(part => part.type === 'year')!.value);
  const month = parseInt(parts.find(part => part.type === 'month')!.value);
  const day = parseInt(parts.find(part => part.type === 'day')!.value);
  const hour = parseInt(parts.find(part => part.type === 'hour')!.value);
  const minute = parseInt(parts.find(part => part.type === 'minute')!.value);
  const second = parseInt(parts.find(part => part.type === 'second')!.value);

  // Create a new Date object with these local time components
  // Note: This creates a Date as if these were UTC components, but they represent local time
  return new Date(year, month - 1, day, hour, minute, second);
}

/**
 * Gets the current time in the configured timezone and returns it as a UTC Date object.
 * This is the proper way to get "now" for storing in the database.
 *
 * The returned Date object stores the UTC time that corresponds to the current local time.
 * For example, if it's 13:41 CET (UTC+1), this returns a Date representing 12:41 UTC.
 *
 * @returns Date object in UTC representing the current moment in the configured timezone
 */
export function getCurrentTimeAsUTC(): Date {
  const now = new Date();

  // Get the current local time components in the configured timezone
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });

  const parts = formatter.formatToParts(now);
  const year = parseInt(parts.find(part => part.type === 'year')!.value);
  const month = parseInt(parts.find(part => part.type === 'month')!.value);
  const day = parseInt(parts.find(part => part.type === 'day')!.value);
  const hour = parseInt(parts.find(part => part.type === 'hour')!.value);
  const minute = parseInt(parts.find(part => part.type === 'minute')!.value);
  const second = parseInt(parts.find(part => part.type === 'second')!.value);

  // Get the timezone offset
  const offsetHours = getCurrentTimezoneOffset();

  // Calculate UTC time by subtracting the offset
  let utcHours = hour - offsetHours;
  let utcDay = day;
  let utcMonth = month;
  let utcYear = year;

  // Handle day boundary crossing
  if (utcHours < 0) {
    utcHours += 24;
    utcDay -= 1;

    // Handle month boundary
    if (utcDay < 1) {
      utcMonth -= 1;
      if (utcMonth < 1) {
        utcMonth = 12;
        utcYear -= 1;
      }
      // Get last day of previous month
      utcDay = new Date(utcYear, utcMonth, 0).getDate();
    }
  } else if (utcHours >= 24) {
    utcHours -= 24;
    utcDay += 1;

    // Handle month boundary
    const daysInMonth = new Date(utcYear, utcMonth, 0).getDate();
    if (utcDay > daysInMonth) {
      utcDay = 1;
      utcMonth += 1;
      if (utcMonth > 12) {
        utcMonth = 1;
        utcYear += 1;
      }
    }
  }

  // Create a UTC Date object
  return new Date(Date.UTC(utcYear, utcMonth - 1, utcDay, utcHours, minute, second));
}

// Legacy function names for backward compatibility
export const getStartOfDanishDayUTC = getStartOfTimezoneDayUTC;
export const getEndOfDanishDayUTC = getEndOfTimezoneDayUTC;
export const getStartOfDanishYearUTC = getStartOfTimezoneYearUTC;
export const getCurrentDanishDate = getCurrentTimezoneDate; 