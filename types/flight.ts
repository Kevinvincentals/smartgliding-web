/**
 * Aircraft registration and configuration data
 */
export interface Aircraft {
  /** Unique identifier for the aircraft */
  id: number | string
  /** Aircraft registration/call sign */
  registration: string
  /** Aircraft type/model */
  type: string
  /** Whether the aircraft has two seats */
  isDoubleSeater: boolean
  /** Whether the aircraft has FLARM tracking */
  hasFlarm: boolean
  /** FLARM identifier (optional) */
  flarmId?: string
  /** Competition number/identifier (optional) */
  competitionId?: string
  /** Whether this is a guest aircraft not in the club fleet */
  isGuest?: boolean
  /** Timestamp when the aircraft was added */
  createdAt?: string
}

/**
 * Pilot information
 */
export interface Pilot {
  /** Unique identifier for the pilot */
  id: number | string
  /** Full pilot name */
  name: string
  /** First name (optional, for detailed records) */
  firstName?: string
  /** Last name (optional, for detailed records) */
  lastName?: string
  /** Email address (optional) */
  email?: string
}

/**
 * Airfield/airport information
 */
export interface AirfieldOption {
  /** Unique airfield identifier (ICAO code) */
  id: string
  /** Human-readable airfield name (includes code and name) */
  name: string
  /** Airfield type (optional) */
  type?: string
  /** ICAO code (optional) */
  icaoCode?: string
  /** Coordinates (optional) */
  latitude?: number
  longitude?: number
}

/**
 * Flight status types
 */
export type FlightStatus = 'pending' | 'in_flight' | 'completed' | 'deleted' | 'landing_only'

/**
 * Launch method types
 */
export type LaunchMethod = 'S' | 'M' | 'F' // Spilstart (Winch), Selvstart (Self-launch), Flyslæb (Aerotow)

/**
 * Complete flight record
 */
export interface Flight {
  /** Unique flight identifier */
  id: number
  /** Original flight identifier (for imports) */
  originalId?: string
  /** Aircraft used for the flight */
  aircraft: Aircraft
  /** Primary pilot */
  pilot: Pilot | null
  /** Co-pilot or instructor */
  coPilot: Pilot | null
  /** Takeoff time in ISO format */
  startTime: string | null
  /** Landing time in ISO format */
  endTime: string | null
  /** Current flight status */
  status: FlightStatus
  /** Distance flown in kilometers */
  distance?: number
  /** Whether this is a school/training flight */
  isSchoolFlight: boolean
  /** Departure airfield */
  startField: string
  /** Arrival airfield */
  landingField: string | null
  /** Method used to launch the aircraft */
  launchMethod: LaunchMethod
  /** Flight notes */
  notes?: string | null
  /** Whether the flight has been deleted */
  deleted?: boolean
  /** FLARM online status */
  flarmStatus?: 'online' | 'offline' | 'unknown' | null
  /** Timestamp when the flight was created */
  createdAt?: string
  /** Timestamp when the flight was last updated */
  updatedAt?: string
  /** Club identifier that owns this flight */
  clubId?: string
  /** Flight duration in minutes */
  flightDuration?: number
  /** Guest pilot name (if not a club member) */
  guestPilotName?: string
  /** Guest co-pilot name (if not a club member) */
  guestCoPilotName?: string
  /** Whether this plane is marked as private for the day */
  isPrivatePlane?: boolean
  /** MongoDB ObjectId for the plane */
  planeId?: string | null
  /** Whether this flight belongs to the current club (can edit/delete) */
  isOwnFlight?: boolean
  /** Club information for the flight */
  club?: {
    id: string
    name: string
    homefield: string | null
  } | null
}

/**
 * Simplified flight data for API responses
 */
export interface FlightSummary {
  /** Flight identifier */
  id: number
  /** Aircraft registration */
  registration: string
  /** Aircraft type */
  type: string
  /** Primary pilot name */
  pilotName: string | null
  /** Co-pilot name */
  coPilotName: string | null
  /** Takeoff time */
  startTime: string | null
  /** Landing time */
  endTime: string | null
  /** Flight status */
  status: FlightStatus
  /** Flight duration in minutes */
  duration?: number
  /** Whether this is a school flight */
  isSchoolFlight: boolean
}

/**
 * Flight creation request payload
 */
export interface CreateFlightRequest {
  /** Aircraft to be used */
  aircraft: Pick<Aircraft, 'id' | 'registration' | 'type' | 'hasFlarm' | 'flarmId' | 'competitionId'>
  /** Primary pilot */
  pilot: Pick<Pilot, 'id' | 'name'>
  /** Co-pilot (optional) */
  coPilot?: Pick<Pilot, 'id' | 'name'>
  /** Whether this is a school flight */
  isSchoolFlight: boolean
  /** Departure airfield */
  startField: string
  /** Launch method */
  launchMethod: LaunchMethod
}

/**
 * Flight update request payload
 */
export interface UpdateFlightRequest {
  /** Flight identifier */
  id: number
  /** Updated takeoff time */
  startTime?: string
  /** Updated landing time */
  endTime?: string
  /** Updated landing field */
  landingField?: string
  /** Updated status */
  status?: FlightStatus
}

