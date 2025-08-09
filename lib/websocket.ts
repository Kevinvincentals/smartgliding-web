/**
 * WebSocket utilities for the application
 */

import { LiveAircraft } from "@/types/live-map";

// Handle different WebSocket connection types
export type WebSocketType = 'standard' | 'plane-tracker';

// Store active WebSocket connections by type to prevent duplicates
const activeConnections: Record<WebSocketType, WebSocket | null> = {
  'standard': null,
  'plane-tracker': null
};

// Process aircraft data from the WebSocket message
export function processAircraftData(data: any): LiveAircraft {
  // Helper function to create Date objects from UTC timestamps
  const createDateFromTimestamp = (timestamp: string | null | undefined, isAdsb: boolean = false): Date => {
    if (!timestamp) return new Date();
    
    try {
      // For ADSB data, ensure we handle the timestamp as UTC
      // ADSB timestamps should be in ISO format and treated as UTC
      let date: Date;
      
      if (isAdsb) {
        // ADSB timestamps are in UTC, ensure they're parsed correctly
        // If the timestamp doesn't end with 'Z', add it to indicate UTC
        const utcTimestamp = timestamp.endsWith('Z') ? timestamp : timestamp + 'Z';
        date = new Date(utcTimestamp);
      } else {
        // OGN/FLARM timestamps - existing logic
        date = new Date(timestamp);
      }
      
      // Add basic validation to catch invalid dates
      if (isNaN(date.getTime())) {
        console.error(`Invalid timestamp received: "${timestamp}" parsed as invalid date`);
        return new Date();
      }
      
      return date;
    } catch (error) {
      console.error('Error parsing timestamp:', error, timestamp);
      return new Date();
    }
  };

  // Detect data source
  const source = data.source || (data.aircraft_id?.startsWith('adsb_') ? 'adsb' : 'ogn');
  
  // Handle ADSB data format
  if (source === 'adsb') {
    console.log('Processing ADSB aircraft data:', data);
    const aircraft = {
      id: data.aircraft_id || data.id,
      registration: data.registration || data.flight?.trim() || `ADSB-${(data.hex || data.id || '').substring(0, 4)}`,
      type: data.aircraft_type || "Unknown",
      aircraftType: data.aircraft_type,
      aircraftModel: data.aircraft_type,
      pilot: "Unknown",
      coPilot: undefined,
      latitude: data.latitude,
      longitude: data.longitude,
      altitude: data.altitude ? Math.round(data.altitude * 0.3048) : 0, // Convert feet to meters
      heading: data.track || 0,
      track: data.track,
      speed: data.ground_speed ? data.ground_speed * 1.852 : 0, // Convert knots to km/h
      startTime: createDateFromTimestamp(data.timestamp, true), // Pass true for ADSB
      distance: 0, // Not provided by tracker
      isSchoolFlight: false,
      source: 'adsb' as const,
      hasFlarm: false, // ADSB aircraft don't have FLARM
      // Additional tracker fields
      climbRate: data.vertical_rate ? data.vertical_rate * 0.00508 : 0, // Convert ft/min to m/s
      lastSeen: createDateFromTimestamp(data.timestamp, true), // Pass true for ADSB
      turnRate: undefined // Not directly available in ADSB data
    };
    console.log('Processed ADSB aircraft:', aircraft);
    return aircraft;
  }
  
  // Handle OGN/FLARM data format (existing logic)
  return {
    id: data.id,
    registration: data.registration || `FLARM-${data.id.substring(0, 4)}`,
    type: data.aircraft_model || "Unknown",
    aircraftType: data.aircraft_type,
    aircraftModel: data.aircraft_model,
    pilot: "Unknown",
    coPilot: undefined,
    latitude: data.latitude,
    longitude: data.longitude,
    altitude: data.altitude || 0,
    heading: data.track || 0,
    track: data.track,
    speed: data.ground_speed || 0,
    startTime: createDateFromTimestamp(data.timestamp, false), // Pass false for OGN/FLARM
    distance: 0, // Not provided by tracker
    isSchoolFlight: false,
    source: source === 'ogn' ? 'ogn' as const : 'flarm' as const,
    hasFlarm: true,
    // Additional tracker fields
    climbRate: data.climb_rate || 0,
    lastSeen: createDateFromTimestamp(data.last_seen, false), // Pass false for OGN/FLARM
    turnRate: data.turn_rate,
    climb_rate_30s_avg: data.climb_rate_30s_avg,
    climb_rate_60s_avg: data.climb_rate_60s_avg
  };
}

/**
 * Create a WebSocket connection with the specified type
 * If a connection of this type already exists and is open, it will be reused
 */
export function createWebSocket(type: WebSocketType = 'standard'): WebSocket | null {
  if (typeof window === 'undefined') {
    console.warn('Cannot create WebSocket in server environment');
    return null;
  }
  
  // Check if we already have an active connection of this type
  const existingConnection = activeConnections[type];
  if (existingConnection && existingConnection.readyState === WebSocket.OPEN) {
    console.log(`Reusing existing ${type} WebSocket connection`);
    return existingConnection;
  }

  // If existing connection is connecting, just return it
  if (existingConnection && existingConnection.readyState === WebSocket.CONNECTING) {
    console.log(`Returning connecting ${type} WebSocket connection`);
    return existingConnection;
  }
  
  // Clean up any existing connection that's not OPEN or CONNECTING
  if (existingConnection && 
     (existingConnection.readyState === WebSocket.CLOSING || 
      existingConnection.readyState === WebSocket.CLOSED)) {
    console.log(`Cleaning up non-active ${type} WebSocket connection`);
    activeConnections[type] = null;
  }
  
  try {
    // Use the correct WebSocket URL based on location
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    let wsUrl = `${protocol}//${window.location.host}/api/ws`;
    
    // Add type parameter if it's a plane-tracker connection
    if (type === 'plane-tracker') {
      wsUrl += '?type=plane-tracker';
    }
    
    console.log(`Creating WebSocket connection to ${wsUrl} (type: ${type})`);
    const newSocket = new WebSocket(wsUrl);
    
    // Store the new connection
    activeConnections[type] = newSocket;
    
    // Add event listeners to clean up connection when closed
    newSocket.addEventListener('close', () => {
      console.log(`WebSocket connection closed (type: ${type})`);
      if (activeConnections[type] === newSocket) {
        activeConnections[type] = null;
      }
    });
    
    return newSocket;
  } catch (error) {
    console.error('Failed to create WebSocket:', error);
    activeConnections[type] = null;
    return null;
  }
}

/**
 * Subscribe to plane tracker data on an existing WebSocket
 */
export function subscribePlaneTracker(socket: WebSocket | null): void {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    console.warn('Cannot subscribe to plane tracker: WebSocket not open');
    return;
  }
  
  try {
    socket.send(JSON.stringify({
      type: 'subscribe',
      channel: 'plane-tracker'
    }));
    console.log('Subscribed to plane tracker data');
  } catch (error) {
    console.error('Failed to subscribe to plane tracker:', error);
  }
}

/**
 * Unsubscribe from plane tracker data on an existing WebSocket
 */
export function unsubscribePlaneTracker(socket: WebSocket | null): void {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    return;
  }
  
  try {
    socket.send(JSON.stringify({
      type: 'unsubscribe',
      channel: 'plane-tracker'
    }));
    console.log('Unsubscribed from plane tracker data');
  } catch (error) {
    console.error('Failed to unsubscribe from plane tracker:', error);
  }
} 