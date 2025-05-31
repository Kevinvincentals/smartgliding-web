import { z } from 'zod'
import type { LaunchMethod, FlightStatus } from '@/types/flight'

/**
 * Common validation schemas for tablet API endpoints
 */

// MongoDB ObjectId validation
export const mongoIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid MongoDB ObjectId')

// Basic string validations
export const nonEmptyStringSchema = z.string().min(1, 'Field cannot be empty')
export const optionalNonEmptyStringSchema = z.string().min(1).optional()

// Date/time validations
export const isoDateSchema = z.string().datetime('Invalid ISO date format')
export const optionalIsoDateSchema = z.string().datetime('Invalid ISO date format').optional()

// Time format validations - accepts both HH:MM format and ISO date strings
export const timeStringSchema = z.union([
  z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Time must be in HH:MM format'),
  z.string().datetime('Invalid ISO date format')
], {
  errorMap: () => ({ message: 'Time must be in HH:MM format or ISO date format' })
})

// More flexible time schema that handles empty strings and optional values
export const optionalTimeStringSchema = z.union([
  timeStringSchema,
  z.string().length(0), // Allow empty strings
  z.null(),
  z.undefined()
]).optional().transform((val) => {
  // Transform empty strings to null for consistency
  if (val === '' || val === undefined) return null;
  return val;
})

// Numeric validations
export const positiveNumberSchema = z.number().positive('Must be a positive number')
export const nonNegativeNumberSchema = z.number().min(0, 'Must be non-negative')

/**
 * Flight-related schemas
 */
export const launchMethodSchema = z.enum(['S', 'M', 'F'], {
  errorMap: () => ({ message: 'Launch method must be S (Spilstart), M (Selvstart), or F (Flyslæb)' })
}) as z.ZodEnum<[LaunchMethod, ...LaunchMethod[]]>

export const flightStatusSchema = z.enum(['pending', 'in_flight', 'completed', 'deleted', 'landing_only'], {
  errorMap: () => ({ message: 'Invalid flight status' })
}) as z.ZodEnum<[FlightStatus, ...FlightStatus[]]>

/**
 * Pilot schemas
 */
export const pilotIdSchema = z.union([
  mongoIdSchema,
  z.literal('guest'),
  z.string().min(1)
])

export const pilotSchema = z.object({
  id: pilotIdSchema,
  name: nonEmptyStringSchema,
  firstName: optionalNonEmptyStringSchema,
  lastName: optionalNonEmptyStringSchema,
  email: z.string().email().optional()
})

export const optionalPilotSchema = pilotSchema.optional().nullable()

/**
 * Aircraft schemas
 */
export const aircraftIdSchema = z.union([
  mongoIdSchema,
  z.string().min(1)
])

export const aircraftSchema = z.object({
  id: aircraftIdSchema,
  registration: nonEmptyStringSchema,
  type: nonEmptyStringSchema,
  isDoubleSeater: z.boolean().optional(),
  hasFlarm: z.boolean().optional(),
  flarmId: optionalNonEmptyStringSchema,
  competitionId: optionalNonEmptyStringSchema,
  isGuest: z.boolean().optional()
})

/**
 * Authentication schemas
 */
export const authRequestSchema = z.object({
  clubId: nonEmptyStringSchema,
  pin: nonEmptyStringSchema
})

/**
 * Flight operation schemas
 */
export const createFlightRequestSchema = z.object({
  aircraft: aircraftSchema,
  pilot: pilotSchema,
  coPilot: optionalPilotSchema,
  isSchoolFlight: z.boolean(),
  startField: nonEmptyStringSchema,
  launchMethod: launchMethodSchema.default('S')
})

export const updateFlightRequestSchema = z.object({
  id: z.union([z.number(), mongoIdSchema]),
  originalId: mongoIdSchema.optional(),
  pilot: optionalPilotSchema,
  coPilot: optionalPilotSchema,
  startTime: optionalTimeStringSchema,
  endTime: optionalTimeStringSchema,
  status: flightStatusSchema.optional(),
  isSchoolFlight: z.boolean().optional(),
  startField: optionalNonEmptyStringSchema,
  landingField: z.union([optionalNonEmptyStringSchema, z.null()]).optional(),
  launchMethod: launchMethodSchema.optional(),
  distance: nonNegativeNumberSchema.optional()
})

export const deleteFlightRequestSchema = z.object({
  flightId: z.union([z.number(), mongoIdSchema]),
  originalId: mongoIdSchema.optional()
})

/**
 * Query parameter schemas
 */
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: optionalNonEmptyStringSchema,
  sortOrder: z.enum(['asc', 'desc']).default('desc')
})

export const dateRangeSchema = z.object({
  startDate: optionalIsoDateSchema,
  endDate: optionalIsoDateSchema
})

export const flightQuerySchema = paginationSchema.extend({
  airfield: optionalNonEmptyStringSchema,
  includeDeleted: z.coerce.boolean().default(false),
  pilotId: optionalNonEmptyStringSchema,
  aircraftId: optionalNonEmptyStringSchema,
  status: flightStatusSchema.optional()
}).merge(dateRangeSchema)

/**
 * Guest plane schemas
 */
export const addGuestPlaneRequestSchema = z.object({
  registration: nonEmptyStringSchema,
  model: nonEmptyStringSchema,
  isTwoSeater: z.boolean().default(false),
  hasFlarm: z.boolean().default(false),
  flarmId: optionalNonEmptyStringSchema,
  competitionId: optionalNonEmptyStringSchema,
  notes: optionalNonEmptyStringSchema
})

/**
 * Statistics schemas
 */
export const statisticsQuerySchema = z.object({
  year: z.coerce.number().int().min(1900).max(new Date().getFullYear() + 1).default(new Date().getFullYear()),
  month: z.coerce.number().int().min(1).max(12).optional(),
  pilotId: optionalNonEmptyStringSchema,
  aircraftId: optionalNonEmptyStringSchema
}).merge(dateRangeSchema)

/**
 * Flight replay schemas
 */
export const flightReplayQuerySchema = z.object({
  flightId: mongoIdSchema,
  startTime: optionalIsoDateSchema,
  endTime: optionalIsoDateSchema,
  interval: z.coerce.number().int().min(1).max(3600).default(30) // seconds
})

/**
 * WebSocket validation schemas
 */
export const websocketMessageSchema = z.object({
  type: nonEmptyStringSchema,
  event: optionalNonEmptyStringSchema,
  data: z.any().optional(),
  isNewFlight: z.boolean().optional(),
  message: optionalNonEmptyStringSchema,
  targetAirfield: optionalNonEmptyStringSchema
})

/**
 * Quick button action schemas
 */
export const quickButtonActionSchema = z.object({
  flightId: mongoIdSchema,
  action: z.enum(['start', 'end', 'delete'], {
    errorMap: () => ({ message: 'Action must be start, end, or delete' })
  })
})

/**
 * IGC download schemas
 */
export const igcDownloadQuerySchema = z.object({
  flight_logbook_id: mongoIdSchema,
  format: z.enum(['igc', 'kml']).default('igc')
})

/**
 * Live map query schemas
 */
export const livemapQuerySchema = z.object({
  includeGroundTraffic: z.coerce.boolean().default(false),
  bounds: z.object({
    north: z.number(),
    south: z.number(),
    east: z.number(),
    west: z.number()
  }).optional()
})

/**
 * Daily info query schemas
 */
export const dailyInfoQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format').default(
    new Date().toISOString().split('T')[0]
  ),
  includeWeather: z.coerce.boolean().default(true),
  includeStatistics: z.coerce.boolean().default(true)
})

/**
 * Pilot query schemas
 */
export const pilotQuerySchema = z.object({
  includeInactive: z.coerce.boolean().default(false),
  sortBy: z.enum(['name', 'activity', 'flights']).default('activity'),
  search: optionalNonEmptyStringSchema
})

/**
 * Aircraft/plane query schemas
 */
export const planeQuerySchema = z.object({
  includeGuests: z.coerce.boolean().default(true),
  includeInactive: z.coerce.boolean().default(false),
  sortBy: z.enum(['registration', 'type', 'activity']).default('activity'),
  search: optionalNonEmptyStringSchema,
  hasFlarm: z.coerce.boolean().optional()
})

/**
 * Single plane query schema
 */
export const singlePlaneQuerySchema = z.object({
  planeId: optionalNonEmptyStringSchema,
  registration: optionalNonEmptyStringSchema
}).refine(
  (data) => data.planeId || data.registration,
  { message: "Either planeId or registration must be provided" }
)

/**
 * OGN database query schemas
 */
export const ognDatabaseQuerySchema = z.object({
  query: optionalNonEmptyStringSchema,
  limit: z.coerce.number().int().min(1).max(50).default(10)
})

/**
 * Club fields query schema
 */
export const clubFieldsQuerySchema = z.object({
  includeInactive: z.coerce.boolean().default(false)
})

/**
 * Specific FLARM flight query schema
 */
export const specificFlarmFlightQuerySchema = z.object({
  flarmId: nonEmptyStringSchema,
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, 'Start time must be in HH:MM format').optional(),
  endTime: z.string().regex(/^\d{2}:\d{2}$/, 'End time must be in HH:MM format').optional()
})

/**
 * Flight replay schemas
 */
export const flightReplayDataQuerySchema = z.object({
  flight_logbook_id: mongoIdSchema,
  startTime: optionalIsoDateSchema,
  endTime: optionalIsoDateSchema,
  interval: z.coerce.number().int().min(1).max(3600).default(30) // seconds
})

/**
 * Statistics recalculation request schema
 */
export const statisticsRecalculationSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format').optional(),
  flightIds: z.array(mongoIdSchema).optional(),
  recalculateAll: z.boolean().default(false)
})

/**
 * Utility function to validate request body with proper error handling
 */
export function validateRequestBody<T>(schema: z.ZodSchema<T>, data: unknown): {
  success: true
  data: T
} | {
  success: false
  error: string
  details?: string[]
} {
  try {
    const result = schema.safeParse(data)
    
    if (result.success) {
      return { success: true, data: result.data }
    }
    
    const errorDetails = result.error.errors.map(err => 
      `${err.path.join('.')}: ${err.message}`
    )
    
    return {
      success: false,
      error: 'Validation failed',
      details: errorDetails
    }
  } catch (error) {
    return {
      success: false,
      error: 'Invalid request format'
    }
  }
}

/**
 * Utility function to validate query parameters
 */
export function validateQueryParams<T>(schema: z.ZodSchema<T>, params: URLSearchParams): {
  success: true
  data: T
} | {
  success: false
  error: string
  details?: string[]
} {
  try {
    const queryObject = Object.fromEntries(params.entries())
    return validateRequestBody(schema, queryObject)
  } catch (error) {
    return {
      success: false,
      error: 'Invalid query parameters'
    }
  }
} 