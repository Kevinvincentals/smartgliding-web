/**
 * Live aircraft tracking data for real-time map display
 */
export interface LiveAircraft {
  /** Unique identifier for the aircraft */
  id: string | number
  /** Aircraft registration/call sign */
  registration: string
  /** Aircraft type/model */
  type: string
  /** Specific aircraft type (optional) */
  aircraftType?: string
  /** Aircraft model (optional) */
  aircraftModel?: string
  /** Primary pilot name */
  pilot: string
  /** Co-pilot name (optional) */
  coPilot?: string
  /** Current latitude in decimal degrees */
  latitude: number
  /** Current longitude in decimal degrees */
  longitude: number
  /** Current altitude in meters */
  altitude: number
  /** Current heading in degrees (0-360) */
  heading: number
  /** Current ground speed in km/h */
  speed: number
  /** Flight start time */
  startTime: Date
  /** Total distance flown in kilometers */
  distance: number
  /** Whether this aircraft is currently selected in the UI */
  isSelected?: boolean
  /** Whether this is a school/training flight */
  isSchoolFlight?: boolean
  /** Whether this aircraft belongs to the club (registered in local DB) */
  isClubPlane?: boolean
  /** Data source for the aircraft tracking */
  source?: 'adsb' | 'ogn' | 'flarm'
  /** Whether the aircraft has FLARM tracking (legacy field, use source instead) */
  hasFlarm?: boolean
  /** Rate of climb/descent in m/s */
  climbRate?: number
  /** Last time data was received */
  lastSeen?: Date
  /** Turn rate in degrees per second */
  turnRate?: number
  /** Track over ground in degrees */
  track?: number
  /** 30-second average climb rate in m/s (null if insufficient data) */
  climb_rate_30s_avg?: number | null
  /** 60-second average climb rate in m/s (null if insufficient data) */
  climb_rate_60s_avg?: number | null
  /** Flight start time from tracker */
  flightStartTime?: Date
}

/**
 * Live ground vehicle (winch, retrieve car, ...) tracked via an OGN tracker
 */
export interface LiveVehicle {
  /** Raw tracker ID as received from OGN (e.g. "OGN3E5C12") */
  id: string
  /** Normalized OGN device ID (no FLR/OGN/ICA prefix, uppercase) */
  ogn_id: string
  /** Vehicle name from the club registry (e.g. "Wirehenter") */
  name: string
  /** Icon key from lib/vehicle-icons.ts */
  icon: string
  latitude: number
  longitude: number
  /** Track over ground in degrees */
  track: number
  /** Ground speed in km/h */
  speed: number
  lastSeen: Date
}

/**
 * Live position of the startbord tablet
 */
export interface StartbordState {
  deviceId: string
  latitude: number
  longitude: number
  /** Compass heading in degrees, null while the compass is calibrating */
  heading: number | null
  accuracy: number | null
  updatedAt: Date
}

/**
 * Aircraft position update for real-time tracking
 */
export interface AircraftPositionUpdate {
  /** Aircraft identifier */
  id: string | number
  /** Updated latitude */
  latitude: number
  /** Updated longitude */
  longitude: number
  /** Updated altitude */
  altitude: number
  /** Updated heading */
  heading: number
  /** Updated speed */
  speed: number
  /** Timestamp of the update */
  timestamp: Date
}

