/**
 * Standard API response wrapper for tablet endpoints
 */
export interface ApiResponse<T = unknown> {
  /** Whether the request was successful */
  success: boolean
  /** Response data (if successful) */
  data?: T
  /** Error message (if failed) */
  error?: string
  /** Additional error details */
  details?: string
  /** Response metadata */
  meta?: {
    count?: number
    page?: number
    totalPages?: number
    timestamp?: string
  }
}

/**
 * JWT payload structure for tablet authentication
 */
export interface JWTPayload {
  /** User/Club identifier */
  id: string
  /** Club identifier (for tablet authentication) */
  clubId?: string
  /** Club information */
  club?: {
    /** Home airfield for the club */
    homefield?: string
  }
  /** Home airfield identifier */
  homefield?: string
  /** Token expiration timestamp */
  exp?: number
  /** Token issued at timestamp */
  iat?: number
}

/**
 * Tablet authentication request payload
 */
export interface AuthRequest {
  /** Club identifier */
  clubId: string
  /** PIN code for authentication */
  pin: string
}

/**
 * Tablet authentication response
 */
export interface AuthResponse {
  /** Whether authentication was successful */
  success: boolean
  /** Club identifier */
  clubId?: string
  /** Home airfield */
  homefield?: string
  /** Error message if failed */
  error?: string
}

/**
 * Pagination parameters for tablet endpoints
 */
export interface PaginationParams {
  /** Page number (1-based) */
  page?: number
  /** Number of items per page */
  limit?: number
  /** Sort field */
  sortBy?: string
  /** Sort direction */
  sortOrder?: 'asc' | 'desc'
}

/**
 * Date range filter for tablet endpoints
 */
export interface DateRangeFilter {
  /** Start date in ISO format */
  startDate?: string
  /** End date in ISO format */
  endDate?: string
}

/**
 * Common query parameters for tablet flight endpoints
 */
export interface FlightQueryParams extends PaginationParams, DateRangeFilter {
  /** Airfield identifier */
  airfield?: string
  /** Include deleted flights */
  includeDeleted?: boolean
  /** Filter by pilot */
  pilotId?: string
  /** Filter by aircraft */
  aircraftId?: string
  /** Filter by flight status */
  status?: string
}

/**
 * WebSocket message types for tablet
 */
export interface WebSocketMessage<T = unknown> {
  /** Message type identifier */
  type: string
  /** Event name */
  event?: string
  /** Message payload */
  data?: T
  /** Additional flags */
  isNewFlight?: boolean
  /** User-facing message */
  message?: string
  /** Target airfield for filtering */
  targetAirfield?: string
}

/**
 * Error response details for tablet endpoints
 */
export interface ErrorResponse {
  /** Error code */
  code?: string
  /** Error message */
  message: string
  /** Field-specific errors */
  fieldErrors?: Record<string, string[]>
  /** Stack trace (development only) */
  stack?: string
} 