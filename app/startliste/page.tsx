"use client"

import { Suspense, useState, useEffect, useRef, useMemo, ReactElement } from "react"
import { Loader2, WifiOff, User, SettingsIcon, Info, Plus } from "lucide-react"
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription } from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { TooltipProvider } from "@/components/ui/tooltip"
import { TimePickerDialog } from "@/components/time-picker-dialog"
import { FlightCard } from "@/components/flights/flight-card"
import { EmptyFlightList, FlightLoadingAnimation } from "@/components/flights/empty-flight-list"
import { DeletedFlightsList } from "@/components/flights/deleted-flights-list"
import { AddFlightDialog } from "@/components/flights/add-flight-dialog"
import { EditFlightDialog } from "@/components/flights/edit-flight-dialog"
import { useToast } from "@/components/ui/use-toast"
import { formatUTCToLocalTime } from "@/lib/time-utils"
import type { Flight, Aircraft, Pilot, AirfieldOption, LaunchMethod } from "@/types/flight"
import { toast as hotToast } from 'react-hot-toast'
import dynamic from "next/dynamic"
import { StartlisteHeader } from "./components/header"
import { useStartliste } from "@/contexts/startlist-context"

// Dynamically import StatisticsReplayMap with SSR turned off
const StatisticsReplayMap = dynamic(() => 
  import("@/components/statistics/map").then(mod => mod.StatisticsReplayMap), 
  { 
    ssr: false,
    loading: () => (
      <div className="fixed inset-0 bg-background/80 flex items-center justify-center z-50">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
      </div>
    ) 
  }
)

// Add these types at the top of the file
type FlarmStatus = 'online' | 'offline' | 'unknown';
type FlarmStatuses = Record<string, FlarmStatus>;

interface WebSocketMessage {
  type: string;
  event?: string;
  data?: any;
  message?: string;
  flarmId?: string;
  status?: FlarmStatus;
  statuses?: Array<{ flarmId: string; status: FlarmStatus }>;
  timestamp?: number;
}

// Add interface for props
interface StartListProps {
  socket: WebSocket | null;
  wsConnected: boolean;
  dailyInfo?: any;
  authenticatedChannel: string | null;
  airfieldOptions: AirfieldOption[];
}

function StartList({ socket, wsConnected, dailyInfo, authenticatedChannel, airfieldOptions }: StartListProps): ReactElement {
  const [flights, setFlights] = useState<Flight[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const lastUpdateRef = useRef<HTMLDivElement>(null)
  const [lastUpdateTime, setLastUpdateTime] = useState<Date | null>(null)
  const [lastUpdatedFlightId, setLastUpdatedFlightId] = useState<string | null>(null)
  const { toast } = useToast()
  
  // Refs for timeouts
  const highlightTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const flarmStatusIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Add state for FLARM status tracking
  const [flarmStatuses, setFlarmStatuses] = useState<FlarmStatuses>({});

  // Add state for API flights
  const [apiFlights, setApiFlights] = useState<any[]>([])

  // Display settings state
  const [hideCompleted, setHideCompleted] = useState(false)
  const [hideDeleted, setHideDeleted] = useState(true)
  const [compactMode, setCompactMode] = useState(false)
  const [completedFlightsCount, setCompletedFlightsCount] = useState(0)
  const [deletedFlightsCount, setDeletedFlightsCount] = useState(0)

  // Add state for flight replay
  const [selectedFlightForReplay, setSelectedFlightForReplay] = useState<{ id: string; registration: string } | null>(null)
  
  // Add a ref to track the last refresh timestamp
  const lastRefreshTimestampRef = useRef<number>(0);
  const REFRESH_DEBOUNCE_MS = 500; // Reduced from 2000ms to 500ms for better responsiveness

  // Add another ref for WebSocket initialization
  const wsInitializedRef = useRef(false);
  
  // Add ref to track if a fetch is currently in progress
  const fetchInProgressRef = useRef(false);

  // Add state for duplicate operation debouncing
  const [isDuplicating, setIsDuplicating] = useState(false)

  // Helper function for simple sorting without complex numbering (used for intermediate operations)
  const simpleSortFlights = (flightsToSort: any[]): any[] => {
    return [...flightsToSort].sort((a, b) => {
      // Simple sort by status priority for intermediate operations
      const getStatusPriority = (flight: any) => {
        const status = flight.status;
        if (status === 'pending') return 1;
        if (status === 'in_flight') return 2;
        if (status === 'completed') return 3;
        return 4;
      };
      
      const aPriority = getStatusPriority(a);
      const bPriority = getStatusPriority(b);
      
      if (aPriority !== bPriority) {
        return aPriority - bPriority;
      }
      
      // Within same status, sort by time
      if (a.status === 'pending') {
        return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
      } else {
        const aTime = a.startTime ? new Date(`1970-01-01T${a.startTime}:00Z`).getTime() : 0;
        const bTime = b.startTime ? new Date(`1970-01-01T${b.startTime}:00Z`).getTime() : 0;
        
        if (aTime !== bTime) {
          return aTime - bTime;
        }
        
        // Use createdAt as tiebreaker
        const aCreatedTime = new Date(a.createdAt || 0).getTime();
        const bCreatedTime = new Date(b.createdAt || 0).getTime();
        return aCreatedTime - bCreatedTime;
      }
    });
  };

  // New function to create numbering-based display order
  const createDisplayOrder = (flights: any[]): any[] => {
    // Separate flights into three categories
    const pendingFlights = flights.filter(f => f.status === 'pending');
    const normalFlights = flights.filter(f => f.status !== 'pending' && f.startTime); // Has takeoff time
    const landingOnlyFlights = flights.filter(f => f.status !== 'pending' && !f.startTime); // No takeoff but has landing
    
    // Sort normal flights by takeoff time with createdAt tiebreaker
    const sortedNormalFlights = normalFlights.sort((a, b) => {
      const aTime = new Date(`1970-01-01T${a.startTime}:00Z`).getTime();
      const bTime = new Date(`1970-01-01T${b.startTime}:00Z`).getTime();
      
      // Sort by takeoff time first
      if (aTime !== bTime) {
        return aTime - bTime; // Earliest takeoff first
      }
      
      // Same takeoff time: use originalId for deterministic ordering (more stable than createdAt)
      if (a.originalId && b.originalId) {
        return a.originalId.localeCompare(b.originalId);
      }
      
      // Fallback to createdAt if no originalId
      const aCreatedTime = new Date(a.createdAt || 0).getTime();
      const bCreatedTime = new Date(b.createdAt || 0).getTime();
      return aCreatedTime - bCreatedTime;
    });
    
    // Sort landing-only flights by landing time, then by originalId for stability
    const sortedLandingOnlyFlights = landingOnlyFlights.sort((a, b) => {
      // First try to sort by landing time if both have it
      if (a.endTime && b.endTime) {
        const aTime = new Date(`1970-01-01T${a.endTime}:00Z`).getTime();
        const bTime = new Date(`1970-01-01T${b.endTime}:00Z`).getTime();
        if (aTime !== bTime) {
          return aTime - bTime;
        }
      }
      
      // Use originalId for deterministic ordering
      if (a.originalId && b.originalId) {
        return a.originalId.localeCompare(b.originalId);
      }
      
      // Fallback to createdAt
      const aCreatedTime = new Date(a.createdAt || 0).getTime();
      const bCreatedTime = new Date(b.createdAt || 0).getTime();
      return aCreatedTime - bCreatedTime;
    });
    
    // Sort pending flights by creation time, but use originalId for stability when times are close
    const sortedPending = pendingFlights.sort((a, b) => {
      const aCreatedTime = new Date(a.createdAt || 0).getTime();
      const bCreatedTime = new Date(b.createdAt || 0).getTime();
      
      // If created within 1 second of each other, use originalId for deterministic ordering
      if (Math.abs(aCreatedTime - bCreatedTime) < 1000 && a.originalId && b.originalId) {
        return b.originalId.localeCompare(a.originalId); // Reverse for newest first in pending
      }
      
      return bCreatedTime - aCreatedTime; // Newest first for pending
    });
    
    // Add sequential numbering
    const numberedFlights: any[] = [];
    
    // Number normal flights first (earliest takeoff = #1)
    sortedNormalFlights.forEach((flight, index) => {
      numberedFlights.push({
        ...flight,
        sequentialNumber: index + 1
      });
    });
    
    // Number landing-only flights next (get numbers after normal flights)
    sortedLandingOnlyFlights.forEach((flight, index) => {
      numberedFlights.push({
        ...flight,
        sequentialNumber: sortedNormalFlights.length + index + 1
      });
    });
    
    // Number pending flights with highest numbers
    sortedPending.forEach((flight, index) => {
      numberedFlights.push({
        ...flight,
        sequentialNumber: sortedNormalFlights.length + sortedLandingOnlyFlights.length + sortedPending.length - index
      });
    });
    
    // Now sort for display: by sequential number (highest first)
    return numberedFlights.sort((a, b) => b.sequentialNumber - a.sequentialNumber);
  };

  // Function to ensure complete refresh of flight data
  const refreshAllFlights = (shouldSetLoading = false) => {
    const now = Date.now();
    
    // Check if we've refreshed too recently
    if (now - lastRefreshTimestampRef.current < REFRESH_DEBOUNCE_MS) {
      return;
    }
    
    lastRefreshTimestampRef.current = now;
    
    if (shouldSetLoading) {
      setIsLoading(true);
    }
    fetchFlights();
  };

  // Fetch flights from API
  const fetchFlights = async () => {
    try {
      // Prevent multiple simultaneous API calls
      if (fetchInProgressRef.current) {
        return;
      }
      
      // Mark fetch as in progress
      fetchInProgressRef.current = true;
      
      const response = await fetch('/api/tablet/fetch_flights?includeDeleted=true');
      if (!response.ok) {
        throw new Error('Failed to fetch flights');
      }
      const data = await response.json();
      
      if (data.success && data.flights) {
        setApiFlights(data.flights);
        const flightCount = data.flights.length;
        
        if (flightCount > 0) {
          const pendingCount = data.flights.filter((f: any) => 
            f.status === 'PENDING' || !f.status || (!f.takeoff_time && !f.landing_time)
          ).length;
          
          const flyingCount = data.flights.filter((f: any) => 
            (f.status === 'INFLIGHT' || f.status === 'in_flight') || 
            (f.takeoff_time && !f.landing_time)
          ).length;
          
          const deletedCount = data.flights.filter((f: any) => 
            f.status === 'deleted' || f.deleted
          ).length;
          
          // Only show toast if it's not the first load (to avoid notification on page load)
          if (!isLoading) {
            let message = '';
            if (flyingCount > 0) {
              message = `${flyingCount} ${flyingCount === 1 ? 'fly' : 'fly'} i luften`;
              if (pendingCount > 0) {
                message += `, ${pendingCount} planlagt`;
              }
            } else if (pendingCount > 0) {
              message = `${pendingCount} planlagte ${pendingCount === 1 ? 'flyvning' : 'flyvninger'}`;
            } else {
              message = `${flightCount} ${flightCount === 1 ? 'flyvning' : 'flyvninger'} i dag`;
            }
            
            if (deletedCount > 0) {
              message += ` (${deletedCount} slettet)`;
            }
            
            toast({
              title: "Flyvninger opdateret",
              description: message,
              variant: "default",
            });
          }
        } else {
          // Only set loading to false if there's no data
          setIsLoading(false);
        }
      } else {
        // Set loading to false if API returns invalid data
        setIsLoading(false);
      }
    } catch (err) {
      setError('Failed to fetch flights');
      // Set loading to false on error
      setIsLoading(false);
    } finally {
      fetchInProgressRef.current = false;
    }
  };

  // Add a function to get all active FLARM IDs that we should monitor
  const getActiveFlarmIds = (): string[] => {
    const flarmIds: string[] = [];
    
    // Include FLARM IDs from planes that are in-flight or pending
    flights.forEach(flight => {
      if ((flight.status === 'in_flight' || flight.status === 'pending') && 
          flight.aircraft?.flarmId && 
          flight.aircraft.hasFlarm &&
          flight.aircraft.flarmId !== 'none' && 
          flight.aircraft.flarmId !== 'unknown') {
        flarmIds.push(flight.aircraft.flarmId);
      }
    });
    
    return flarmIds;
  };
  
  // Function to request FLARM statuses for active planes
  const requestFlarmStatuses = () => {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return;
    }
    
    const flarmIds = getActiveFlarmIds();
    if (flarmIds.length === 0) {
      // No need to make a request if there are no FLARM IDs to monitor
      return;
    }
    
    // Send batch request
    socket.send(JSON.stringify({
      type: 'flarm_status_batch_request',
      flarmIds
    }));
  };
  
  // Set up polling for FLARM status
  useEffect(() => {
    if (socket && wsConnected) {
      // Clear any existing interval
      if (flarmStatusIntervalRef.current) {
        clearInterval(flarmStatusIntervalRef.current);
        flarmStatusIntervalRef.current = null;
      }
      
      // Initial request
      requestFlarmStatuses();
      
      // Set up polling every 10 minutes (instead of every minute)
      flarmStatusIntervalRef.current = setInterval(() => {
        requestFlarmStatuses();
      }, 600000); // 10 minutes
    }
    
    // Cleanup on unmount or when socket changes
    return () => {
      if (flarmStatusIntervalRef.current) {
        clearInterval(flarmStatusIntervalRef.current);
        flarmStatusIntervalRef.current = null;
      }
    };
  }, [socket, wsConnected]); // Remove flights dependency to prevent double requests

  // Handle FLARM status updates
  const handleFlarmStatus = (flarmId: string, status: FlarmStatus) => {
    if (status === 'online' || status === 'offline') {
      setFlarmStatuses(prev => ({
        ...prev,
        [flarmId]: status
      }));
    }
  };

  // Handle batch FLARM status updates
  const handleBatchFlarmStatus = (statuses: Array<{ flarmId: string; status: FlarmStatus }>) => {
    const newStatuses: FlarmStatuses = {};
    statuses.forEach(({ flarmId, status }) => {
      if (status === 'online' || status === 'offline') {
        newStatuses[flarmId] = status;
      }
    });
    
    setFlarmStatuses(prev => ({
      ...prev,
      ...newStatuses
    }));
  };

  // Handle flight creation
  const handleFlightCreated = (data: any) => {
    if (data?.plane?.flarm_id) {
      socket?.send(JSON.stringify({
        type: 'flarm_status_request',
        flarmId: data.plane.flarm_id
      }));
    }
  };

  // Handle flight updates
  const handleFlightUpdate = (data: WebSocketMessage) => {
    // Determine the airfield of the incoming flight update
    const flightAirfield = data.data?.takeoff_airfield || data.data?.landing_airfield || data.data?.club?.homefield || data.data?.startField;

    // Only process the update if it matches the authenticated channel or if no channel is set
    if (authenticatedChannel && flightAirfield && flightAirfield !== authenticatedChannel) {
      return; 
    }

    // Show appropriate notification only for relevant channel
    if (data.message) {
      const toastConfig = getToastConfig(data.event);
      toast({
        title: toastConfig.title,
        description: data.message,
        variant: toastConfig.variant,
      });
    }

    // Handle all flight events with complete data directly (avoid API calls)
    if (data.data && ['flight_created', 'takeoff', 'udtakeoff', 'landing', 'udlanding', 'flight_edited', 'flight_takeoff', 'flight_landing'].includes(data.event || '')) {
      // Handle FLARM status request for flights with FLARM
      if (data.data?.flarm_id) {
        handleFlightCreated(data.data);
      }
      
      // Transform the WebSocket flight data to match our Flight interface
      const wsFlightData = data.data;
      
      // Create aircraft object
      const aircraft: Aircraft = {
        id: wsFlightData.planeId ? parseInt(wsFlightData.planeId.substring(0, 8), 16) : Math.floor(Math.random() * 1000),
        registration: wsFlightData.registration || 'Unknown',
        type: wsFlightData.type || 'Unknown',
        isDoubleSeater: wsFlightData.plane?.is_twoseater || false,
        hasFlarm: false, // Will be updated below
        flarmId: undefined, // Using undefined instead of null
      }
      
      // Get FLARM ID and update aircraft object
      const flarmId = wsFlightData.flarm_id || null;
      const hasValidFlarm = wsFlightData.plane?.has_valid_flarm ?? (flarmId && flarmId !== 'none' && flarmId !== 'unknown');
      aircraft.flarmId = flarmId;
      aircraft.hasFlarm = hasValidFlarm;
      
      // Create pilot objects
      const pilot = wsFlightData.pilot ? wsFlightData.pilot : (
        wsFlightData.pilot1 && wsFlightData.pilot1.firstname && wsFlightData.pilot1.lastname ? {
          id: wsFlightData.pilot1.id,
          name: `${wsFlightData.pilot1.firstname} ${wsFlightData.pilot1.lastname}`
        } : (wsFlightData.guest_pilot1_name ? {
          id: 'guest',
          name: wsFlightData.guest_pilot1_name
        } : null)
      );
      
      const coPilot = wsFlightData.coPilot ? wsFlightData.coPilot : (
        wsFlightData.pilot2 && wsFlightData.pilot2.firstname && wsFlightData.pilot2.lastname ? {
          id: wsFlightData.pilot2.id,
          name: `${wsFlightData.pilot2.firstname} ${wsFlightData.pilot2.lastname}`
        } : (wsFlightData.guest_pilot2_name ? {
          id: 'guest',
          name: wsFlightData.guest_pilot2_name
        } : null)
      );
      
      // Determine status
      const isDeleted = wsFlightData.deleted === true;
      let status: 'completed' | 'pending' | 'in_flight' | 'deleted' = 'pending';
      if (isDeleted) status = 'deleted';
      else if (wsFlightData.status === 'completed' || wsFlightData.status === 'COMPLETED') status = 'completed';
      else if (wsFlightData.status === 'in_flight' || wsFlightData.status === 'INFLIGHT') status = 'in_flight';
      else if (wsFlightData.status === 'LANDED' && wsFlightData.landing_time) status = 'completed';
      else if (wsFlightData.status === 'landing_only') status = 'completed';
      else if (wsFlightData.takeoff_time && !wsFlightData.landing_time) status = 'in_flight';
      else if (wsFlightData.takeoff_time && wsFlightData.landing_time) status = 'completed';
      else status = 'pending';
      
      // Create the flight object
      const updatedFlight: Flight = {
        id: parseInt(wsFlightData.id.substring(0, 8), 16),
        originalId: wsFlightData.id,
        aircraft,
        pilot,
        coPilot,
        startTime: formatUTCToLocalTime(wsFlightData.takeoff_time),
        endTime: formatUTCToLocalTime(wsFlightData.landing_time),
        status,
        distance: wsFlightData.flight_distance || 0,
        isSchoolFlight: wsFlightData.is_school_flight || false,
        startField: wsFlightData.takeoff_airfield || 'Unknown',
        landingField: wsFlightData.landing_airfield || null,
        launchMethod: (wsFlightData.launch_method as LaunchMethod) || 'S',
        notes: wsFlightData.notes || null,
        deleted: isDeleted,
        createdAt: wsFlightData.createdAt, // Add the missing createdAt field
        isPrivatePlane: wsFlightData.isPrivatePlane || false, // Pass through the private plane status
        planeId: wsFlightData.planeId || null, // Pass through the MongoDB ObjectId for the plane
        isOwnFlight: dailyInfo?.clubId ? wsFlightData.clubId === dailyInfo.clubId : true, // Calculate based on current user's club, default to true if clubId not available
        club: wsFlightData.club // Pass through the club information
      };
      
      // Debug logging for WebSocket flight updates
      console.log('WebSocket Flight Update Debug:', {
        originalId: wsFlightData.id,
        registration: aircraft.registration,
        wsIsOwnFlight: wsFlightData.isOwnFlight,
        flightClubId: wsFlightData.clubId,
        currentClubId: dailyInfo?.clubId,
        calculatedIsOwnFlight: updatedFlight.isOwnFlight,
        wsClub: wsFlightData.club?.name,
        transformedClub: updatedFlight.club?.name,
        event: data.event
      });
      
      // Update or add the flight in the existing flights array
      // DON'T sort here - let the useMemo handle all sorting consistently
      setFlights(prevFlights => {
        // Try multiple ways to find existing flight to avoid duplicates
        let existingFlightIndex = -1;
        
        // First try by originalId (most reliable)
        if (updatedFlight.originalId) {
          existingFlightIndex = prevFlights.findIndex(f => f.originalId === updatedFlight.originalId);
        }
        
        // If not found by originalId, try by integer id
        if (existingFlightIndex === -1) {
          existingFlightIndex = prevFlights.findIndex(f => f.id === updatedFlight.id);
        }
        
        // If still not found, try by registration + pilot combination (for edge cases)
        if (existingFlightIndex === -1) {
          existingFlightIndex = prevFlights.findIndex(f => 
            f.aircraft.registration === updatedFlight.aircraft.registration &&
            f.pilot?.name === updatedFlight.pilot?.name &&
            f.status === 'pending' && updatedFlight.status !== 'pending' // Only match pending -> non-pending transitions
          );
        }
        
        // Special case: Replace temporary flights with real ones from WebSocket
        if (existingFlightIndex === -1) {
          existingFlightIndex = prevFlights.findIndex(f => 
            f.originalId?.startsWith('temp-') && // This is a temporary flight
            f.aircraft.registration === updatedFlight.aircraft.registration &&
            f.pilot?.name === updatedFlight.pilot?.name &&
            f.isSchoolFlight === updatedFlight.isSchoolFlight &&
            f.startField === updatedFlight.startField
          );
          
          if (existingFlightIndex !== -1) {
          }
        }
        
        if (existingFlightIndex !== -1) {
          // Update existing flight
          const updatedFlights = [...prevFlights];
          updatedFlights[existingFlightIndex] = updatedFlight;
          return updatedFlights;
        } else {
          // Add new flight only if it doesn't already exist
          const isDuplicate = prevFlights.some(f => 
            // Only consider it a duplicate if the originalId exactly matches
            // Don't block based on aircraft+pilot combinations for new flights
            f.originalId && f.originalId === updatedFlight.originalId
          );
          
          if (isDuplicate) {
            return prevFlights; // Don't add duplicate
          }
          
          return [...prevFlights, updatedFlight];
        }
      });
      
      return; // Don't do API refresh for any flight events with complete data
    }

    // If this is a page initialization sequence, we don't want to make duplicate requests
    const now = Date.now();
    const isInitialLoad = now - lastRefreshTimestampRef.current < 5000; // Within 5 seconds of initial load
    
    // For events without complete data or other event types, fall back to API refresh
    console.log(`🔄 Flight event '${data.event}' without complete data, falling back to API refresh. Message:`, data);
    refreshAllFlights(false);
  };

  // Get toast configuration based on event type
  const getToastConfig = (event?: string) => {
    const config = {
      title: "Flyvning opdateret",
      variant: "default" as "default" | "destructive"
    };

    switch (event) {
      case 'flight_created':
        config.title = "Ny flyvning planlagt";
        break;
      case 'flight_edited':
        config.title = "Flyvning opdateret";
        break;
      case 'flight_takeoff':
        config.title = "Takeoff registreret";
        break;
      case 'flight_landing':
        config.title = "Landing registreret";
        break;
      case 'flight_landing_removed':
        config.title = "Landing fjernet";
        break;
      case 'flight_deleted':
        config.title = "Flyvning slettet";
        config.variant = "destructive";
        break;
    }

    return config;
  };

  // Handle webhook events
  const handleWebhookEvent = (data: WebSocketMessage) => {
    const eventType = data.event === 'takeoff' || data.event === 'udtakeoff' 
      ? 'takeoff' 
      : (data.event === 'landing' || data.event === 'udlanding' ? 'landing' : 'unknown');
    
    const flightId = data.data?.id || 'unknown';
    
    // Show notification about the event
    if (eventType !== 'unknown' && data.event !== 'testhook') {
      toast({
        title: eventType === 'takeoff' ? "Takeoff registreret" : "Landing registreret",
        description: `Flarm ID: ${flightId}`,
        variant: "default",
      });
    }
  };

  // Handle WebSocket messages
  useEffect(() => {
    if (!socket) return;
    
    const handleMessage = (event: MessageEvent) => {
      try {
        const data: WebSocketMessage = JSON.parse(event.data);
        
        switch (data.type) {
          case 'connection':
            break;
            
          case 'auth_success':
            // Authentication is handled in the context, silently ignore here
            break;
            
          case 'flarm_status':
            if (data.flarmId && data.status) {
              handleFlarmStatus(data.flarmId, data.status);
            }
            break;
            
          case 'flarm_status_batch_response':
            if (data.statuses) {
              handleBatchFlarmStatus(data.statuses);
            }
            break;
            
          case 'webhook':
            handleWebhookEvent(data);
            break;
            
          case 'flight_update':
            // If we're still in the initial connection phase, don't trigger another refresh
            if (!wsInitializedRef.current) {
              return;
            }
            // The handleFlightUpdate function now contains the channel logic
            handleFlightUpdate(data);
            break;
            
          case 'pong':
            // Handle pong silently
            break;
            
          default:
            // Silently ignore unhandled message types
        }
      } catch (error) {
        // Silently handle WebSocket message parsing errors
      }
    };

    // Add message event listener
    socket.addEventListener('message', handleMessage);

    // Only do initial fetch when socket is connected, not just when it exists
    if (wsConnected) {
      refreshAllFlights(true);
      
      // If WebSocket was already connected when component mounted, mark as initialized immediately
      // Only use delay if this is a fresh connection
      if (socket.readyState === WebSocket.OPEN) {
        wsInitializedRef.current = true;
      } else {
        // Set a delayed flag that WebSocket is initialized after 1 second
        // This helps avoid duplicate refreshes during actual initial connection
        const wsInitTimer = setTimeout(() => {
          wsInitializedRef.current = true;
        }, 1000);

        // Store timer for cleanup
        return () => {
          socket.removeEventListener('message', handleMessage);
          clearTimeout(wsInitTimer);
          
          // Clear any timeouts
          if (highlightTimeoutRef.current) {
            clearTimeout(highlightTimeoutRef.current);
            highlightTimeoutRef.current = null;
          }
          
          // Clear FLARM status interval
          if (flarmStatusIntervalRef.current) {
            clearInterval(flarmStatusIntervalRef.current);
            flarmStatusIntervalRef.current = null;
          }
        };
      }
    }

    // If not connected, just add the message listener and provide cleanup
    return () => {
      socket.removeEventListener('message', handleMessage);
      
      // Clear any timeouts
      if (highlightTimeoutRef.current) {
        clearTimeout(highlightTimeoutRef.current);
        highlightTimeoutRef.current = null;
      }
      
      // Clear FLARM status interval
      if (flarmStatusIntervalRef.current) {
        clearInterval(flarmStatusIntervalRef.current);
        flarmStatusIntervalRef.current = null;
      }
    };
  }, [socket, wsConnected, toast]);
  
  // Transform API flights to match the expected Flight interface
  useEffect(() => {
    if (apiFlights.length > 0) {
      // Sort flights by takeoff time (newest first)
      const sortedApiFlights = simpleSortFlights([...apiFlights]);
      
      const transformedFlights = sortedApiFlights.map((apiFlight): Flight => {
        // Format times using our utility function for consistent timezone handling
        const formatTime = (dateString: string | null) => {
          return formatUTCToLocalTime(dateString);
        }
        
        // Create aircraft object
        const aircraft: Aircraft = {
          id: apiFlight.plane?.id ? parseInt(apiFlight.plane.id.substring(0, 8), 16) : Math.floor(Math.random() * 1000),
          registration: apiFlight.registration || apiFlight.plane?.registration_id || 'Unknown',
          type: apiFlight.type || apiFlight.plane?.type || 'Unknown',
          isDoubleSeater: apiFlight.plane?.is_twoseater || false,
          hasFlarm: false, // Will be updated below
          flarmId: undefined, // Using undefined instead of null
        }
        
        // Get FLARM ID from either the flight directly or the plane
        const flarmId = apiFlight.flarm_id || (apiFlight.plane?.flarm_id || null);
        // Use the has_valid_flarm flag from the API if available, otherwise check locally
        const hasValidFlarm = apiFlight.plane?.has_valid_flarm ?? 
          (flarmId && flarmId !== 'none' && flarmId !== 'unknown');
        
        // Update the aircraft object with FLARM data
        aircraft.flarmId = flarmId;
        aircraft.hasFlarm = hasValidFlarm;
        
        // Create pilot objects - handle both regular and guest pilots
        const createPilotObj = (pilotData: any, guestPilotName: string | null | undefined): Pilot | null => {
          // First check for regular pilot data
          if (pilotData && pilotData.firstname && pilotData.lastname) {
            return {
              id: pilotData.id,
              name: `${pilotData.firstname} ${pilotData.lastname}`
            }
          }
          
          // Then check for guest pilot name field
          if (guestPilotName) {
            return {
              id: 'guest',
              name: guestPilotName
            }
          }
          
          // If neither exists, return null
          return null
        }
        
        // Only create pilot objects when actual data exists (including guest pilots)
        const pilot = createPilotObj(apiFlight.pilot1, apiFlight.guest_pilot1_name);
        const coPilot = createPilotObj(apiFlight.pilot2, apiFlight.guest_pilot2_name);
        
        // Check if flight is deleted
        const isDeleted = apiFlight.deleted === true;
        
        // Map API status to UI status - ensure it's one of the allowed values
        let status: 'completed' | 'pending' | 'in_flight' | 'deleted' = 'pending';
        if (isDeleted) status = 'deleted';
        else if (apiFlight.status === 'completed' || apiFlight.status === 'COMPLETED') status = 'completed';
        else if (apiFlight.status === 'in_flight' || apiFlight.status === 'INFLIGHT') status = 'in_flight';
        else if (apiFlight.status === 'LANDED' && apiFlight.landing_time) status = 'completed';
        else if (apiFlight.status === 'landing_only') status = 'completed';
        // If the flight has a takeoff time but no landing time, mark it as in flight regardless of status
        else if (apiFlight.takeoff_time && !apiFlight.landing_time) status = 'in_flight';
        // If the flight has both takeoff and landing times, mark it as completed regardless of status
        else if (apiFlight.takeoff_time && apiFlight.landing_time) status = 'completed';
        else if (apiFlight.status === 'pending' || apiFlight.status === 'PENDING' || !apiFlight.status) status = 'pending';
        
        const transformedFlight = {
          id: parseInt(apiFlight.id.substring(0, 8), 16),
          originalId: apiFlight.id,
          aircraft,
          pilot,
          coPilot,
          startTime: formatTime(apiFlight.takeoff_time),
          endTime: formatTime(apiFlight.landing_time),
          status,
          distance: apiFlight.flight_distance || 0,
          isSchoolFlight: apiFlight.is_school_flight || false,
          startField: apiFlight.takeoff_airfield || 'Unknown',
          landingField: apiFlight.landing_airfield || null,
          launchMethod: apiFlight.launch_method || 'S',
          notes: apiFlight.notes || null,
          deleted: isDeleted,
          createdAt: apiFlight.createdAt, // Add createdAt field for consistent sorting
          isPrivatePlane: apiFlight.isPrivatePlane || false, // Pass through the private plane status
          planeId: apiFlight.planeId || null, // Pass through the MongoDB ObjectId for the plane
          isOwnFlight: apiFlight.isOwnFlight, // Pass through the club ownership status
          club: apiFlight.club // Pass through the club information
        };
        
        return transformedFlight;
      })
      
      setFlights(transformedFlights)
      // Mark as no longer loading when we have data
      setIsLoading(false)
      
      // After updating flights, request FLARM statuses once if we haven't already
      if (socket && socket.readyState === WebSocket.OPEN && transformedFlights.length > 0) {
        // Small delay to ensure state is updated
        setTimeout(requestFlarmStatuses, 500);
      }
    } 
    // Don't immediately set flights to empty when loading
    // This prevents the flash of empty flight list
  }, [apiFlights, isLoading, socket]);

  const [editFlight, setEditFlight] = useState<Flight | null>(null)
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [isTimePickerOpen, setIsTimePickerOpen] = useState(false)
  const [timeEditType, setTimeEditType] = useState<"start" | "end">("start")
  const [timeEditFlightId, setTimeEditFlightId] = useState<number | null>(null)
  const flightListRef = useRef<HTMLDivElement>(null)

  // Add a useEffect to load the settings from localStorage
  useEffect(() => {
    const storedHideCompleted = localStorage.getItem("hideCompleted")
    if (storedHideCompleted) {
      setHideCompleted(storedHideCompleted === "true")
    }

    const storedHideDeleted = localStorage.getItem("hideDeleted")
    if (storedHideDeleted !== null) {
      setHideDeleted(storedHideDeleted === "true")
    }
    
    const storedCompactMode = localStorage.getItem("compactMode")
    if (storedCompactMode !== null) {
      setCompactMode(storedCompactMode === "true")
    }

    // Listen for changes to the settings
    const handleHideCompletedChange = () => {
      const newHideCompleted = localStorage.getItem("hideCompleted") === "true"
      setHideCompleted(newHideCompleted)
    }

    const handleHideDeletedChange = () => {
      const newHideDeleted = localStorage.getItem("hideDeleted") === "true"
      setHideDeleted(newHideDeleted)
    }
    
    const handleCompactModeChange = () => {
      const newCompactMode = localStorage.getItem("compactMode") === "true"
      setCompactMode(newCompactMode)
    }

    window.addEventListener("hideCompletedChanged", handleHideCompletedChange)
    window.addEventListener("hideDeletedChanged", handleHideDeletedChange)
    window.addEventListener("compactModeChanged", handleCompactModeChange)

    return () => {
      window.removeEventListener("hideCompletedChanged", handleHideCompletedChange)
      window.removeEventListener("hideDeletedChanged", handleHideDeletedChange)
      window.removeEventListener("compactModeChanged", handleCompactModeChange)
    }
  }, [])

  const handleAddFlight = (
    aircraft: Aircraft | null,
    pilot: Pilot | null,
    coPilot: Pilot | null,
    isSchoolFlight: boolean,
    startField: string,
    launchMethod: string,
    socket: WebSocket | null
  ) => {
    if (aircraft && pilot) {
      // Don't create temporary flights - just close the dialog
      // The WebSocket will add the flight when the API response comes back
      setIsAddDialogOpen(false)

      // If the aircraft has FLARM and we have a socket connection, we can still request status
      // but don't create a temporary flight
      if (aircraft.hasFlarm && aircraft.flarmId && socket && socket.readyState === WebSocket.OPEN) {
        // Will request FLARM status when flight is created
      }
    }
  }

  const handleStartFlight = async (id: number) => {
    try {
      // Find the flight with the given ID
      const flightToUpdate = flights.find(f => f.id === id);
      
      if (!flightToUpdate || !flightToUpdate.originalId) {
        return;
      }
      
      // Do NOT update local state - wait for WebSocket update instead
      
      // Call the quick_button API to update the takeoff time
      const response = await fetch('/api/tablet/quick_button', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          flightId: flightToUpdate.originalId,
          action: 'start'
        }),
      });

      const data = await response.json();
      
      if (!data.success) {
        toast({
          title: "Fejl ved start af flyvning",
          description: data.error || "Der opstod en fejl ved start af flyvningen",
          variant: "destructive",
        });
        return;
      }
      
      // The WebSocket will trigger the data refresh when it receives the updated flight
    } catch (error) {
      toast({
        title: "Fejl ved start af flyvning",
        description: "Der opstod en uventet fejl",
        variant: "destructive",
      });
    }
  };

  const handleEndFlight = async (id: number) => {
    try {
      // Find the flight with the given ID
      const flightToUpdate = flights.find(f => f.id === id);
      
      if (!flightToUpdate || !flightToUpdate.originalId) {
        return;
      }
      
      // Do NOT update local state - wait for WebSocket update instead
      
      // Call the quick_button API to update the landing time
      const response = await fetch('/api/tablet/quick_button', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          flightId: flightToUpdate.originalId,
          action: 'end'
        }),
      });

      const data = await response.json();
      
      if (!data.success) {
        toast({
          title: "Fejl ved landing af flyvning",
          description: data.error || "Der opstod en fejl ved landing af flyvningen",
          variant: "destructive",
        });
        return;
      }
      
      // The WebSocket will trigger the data refresh when it receives the updated flight
    } catch (error) {
      toast({
        title: "Fejl ved landing af flyvning",
        description: "Der opstod en uventet fejl",
        variant: "destructive",
      });
    }
  };

  const handleDeleteClick = (id: number) => {
    // This function is called when a delete is confirmed from EditFlightDialog
    
    // Find and update the flight with deleted status
    const flightIndex = flights.findIndex(f => f.id === id);
    if (flightIndex !== -1) {
      // Make a copy of the flights array
      const updatedFlights = [...flights];
      
      // Mark the flight as deleted
      updatedFlights[flightIndex] = {
        ...updatedFlights[flightIndex],
        status: 'deleted',
        deleted: true
      };
      
      // Update the state
      setFlights(updatedFlights);
      
      // Close the edit dialog
      setIsEditDialogOpen(false);
      setEditFlight(null);
    }
  };

  const handleEditClick = (flight: Flight) => {
    // Create a clean version of the flight, without default placeholder values
    const flightToEdit = { 
      ...flight,
      // Only include pilot if it's a valid, intentionally assigned pilot (not a placeholder)
      pilot: flight.pilot && flight.pilot.name !== 'Unknown Pilot' ? flight.pilot : null,
      // Only include co-pilot if it's valid
      coPilot: flight.coPilot && flight.coPilot.name !== 'Unknown Pilot' ? flight.coPilot : null,
      // Set status to its current value or "pending" as fallback
      status: flight.status || 'pending'
    };
    
    setEditFlight(flightToEdit);
    setIsEditDialogOpen(true);
  }

  const handleSaveEdit = (updatedFlight: Flight) => {
    // If flight has a start time but no end time, it should be flying
    if (updatedFlight.startTime && !updatedFlight.endTime && updatedFlight.status !== "in_flight") {
      updatedFlight.status = "in_flight";
    }
    
    // If flight has an end time, it should be completed
    if (updatedFlight.endTime && updatedFlight.status !== "completed") {
      updatedFlight.status = "completed";
    }

    // Replace the flight completely rather than selectively updating fields
    // This ensures we don't keep stale pilot data
    setFlights(
      flights.map((flight) => {
        if (flight.id === updatedFlight.id) {
          return JSON.parse(JSON.stringify(updatedFlight));
        }
        return flight;
      })
    );
    
    // If pilot status was explicitly set in the update
    if (updatedFlight.status) {
    }
  };

  const handleTimeClick = (flightId: number, type: "start" | "end") => {
    const flight = flights.find((f) => f.id === flightId)
    if (flight) {
      setTimeEditFlightId(flightId)
      setTimeEditType(type)
      setIsTimePickerOpen(true)
    }
  }

  // Get the current time value for the flight being edited
  const getCurrentTimeValue = (): string | null => {
    if (timeEditFlightId !== null) {
      const flight = flights.find((f) => f.id === timeEditFlightId);
      if (flight) {
        return timeEditType === "start" ? flight.startTime : flight.endTime;
      }
    }
    return null;
  }

  const handleTimeSelected = (time: string) => {
    if (timeEditFlightId !== null) {
      // Find the flight being edited
      const flightToUpdate = flights.find(f => f.id === timeEditFlightId);
      
      if (!flightToUpdate) {
        return;
      }
      
      // Create the updated flight object
      const updatedFlight = { ...flightToUpdate };
      
      if (timeEditType === "start") {
        updatedFlight.startTime = time;
        // Update status based on whether the flight has an end time
        if (updatedFlight.endTime) {
          updatedFlight.status = "completed"; // Has both start and end time
        } else {
          updatedFlight.status = "in_flight"; // Only has start time
        }
      } else {
        updatedFlight.endTime = time;
        // Update status if setting an end time
        updatedFlight.status = "completed";
        // Set landing field to start field if not already set
        if (!updatedFlight.landingField) {
          updatedFlight.landingField = updatedFlight.startField;
        }
      }
      
      // Update flights state
      setFlights(
        flights.map((flight) => {
          if (flight.id === timeEditFlightId) {
            return updatedFlight;
          }
          return flight;
        })
      );
      
      // Update the flight in the edit dialog if it's currently open
      if (isEditDialogOpen && editFlight && editFlight.id === timeEditFlightId) {
        setEditFlight(updatedFlight);
      }
      
      // Save changes to server
      saveFlightToServer(updatedFlight);
      
      setIsTimePickerOpen(false);
      setTimeEditFlightId(null);
    }
  };

  // Function to save flight changes directly to the server
  const saveFlightToServer = async (flight: Flight) => {
    if (!flight.originalId) {
      return false;
    }
    
    try {
      // Do NOT update local state - let WebSocket handle it
      
      // Create payload for the API
      const payload = {
        id: flight.id,
        originalId: flight.originalId,
        pilot: flight.pilot ? {
          id: flight.pilot.id,
          name: flight.pilot.name
        } : null,
        coPilot: flight.coPilot ? {
          id: flight.coPilot.id,
          name: flight.coPilot.name
        } : null,
        startTime: flight.startTime,
        endTime: flight.endTime,
        status: flight.status,
        isSchoolFlight: flight.isSchoolFlight,
        startField: flight.startField,
        landingField: flight.landingField,
        launchMethod: flight.launchMethod,
        distance: flight.distance || 0
      };
      
      const response = await fetch('/api/tablet/edit_flight', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!data.success) {
        toast({
          title: "Fejl ved opdatering",
          description: data.error || "Der opstod en fejl ved opdatering af flyvningen",
          variant: "destructive",
        });
        return false;
      }
      
      console.log('Flight update request submitted successfully:', data);
      // The WebSocket will trigger a data refresh when it receives the updated flight
      return true;
    } catch (error) {
      toast({
        title: "Fejl ved opdatering",
        description: "Der opstod en uventet fejl",
        variant: "destructive",
      });
      return false;
    }
  };

  // Calculate flight duration
  const getFlightDuration = (startTime: string | null, endTime: string | null): string => {
    if (!startTime) return "-"

    // Parse the start time
    const [startHour, startMin] = startTime.split(":").map(Number)

    // If flight is in progress, calculate duration from start time to now
    if (!endTime) {
      const now = new Date()
      const currentHour = now.getHours()
      const currentMin = now.getMinutes()

      let durationMinutes = currentHour * 60 + currentMin - (startHour * 60 + startMin)
      if (durationMinutes < 0) durationMinutes += 24 * 60 // Handle overnight flights

      const hours = Math.floor(durationMinutes / 60)
      const minutes = durationMinutes % 60

      return hours > 0 ? `${hours}t ${minutes}m` : `${minutes}m`
    }

    // If flight is completed, calculate duration from start to end time
    if (startTime && endTime) {
      const [endHour, endMin] = endTime.split(":").map(Number)

      let durationMinutes = endHour * 60 + endMin - (startHour * 60 + startMin)
      if (durationMinutes < 0) durationMinutes += 24 * 60 // Handle overnight flights

      const hours = Math.floor(durationMinutes / 60)
      const minutes = durationMinutes % 60

      return hours > 0 ? `${hours}t ${minutes}m` : `${minutes}m`
    }

    return "-"
  }

  // Add this useEffect to scroll to the bottom when new flights are added
  useEffect(() => {
    if (flightListRef.current) {
      flightListRef.current.scrollTop = flightListRef.current.scrollHeight
    }
  }, [flights.length])

  // Update flight durations for in-progress flights
  useEffect(() => {
    const interval = setInterval(() => {
      // Force re-render to update durations
      setFlights((prev) => [...prev])
    }, 60000) // Update every minute

    return () => clearInterval(interval)
  }, [])

  // Function to remove duplicates from flights array
  const removeDuplicateFlights = (flights: Flight[]): Flight[] => {
    const seen = new Set<string>();
    const uniqueFlights: Flight[] = [];
    
    for (const flight of flights) {
      // Create a unique key for each flight
      const key = flight.originalId || 
                  `${flight.aircraft.registration}-${flight.pilot?.name || 'no-pilot'}-${flight.startTime || 'no-start'}-${flight.endTime || 'no-end'}`;
      
      if (!seen.has(key)) {
        seen.add(key);
        uniqueFlights.push(flight);
      }
    }
    
    return uniqueFlights;
  };

  // Get active and deleted flights with stable sequential numbering
  const { activeFlights, numberedActiveFlights, deletedFlights } = useMemo(() => {
    // First remove any duplicates
    const cleanFlights = removeDuplicateFlights(flights);
    
    // Filter active flights
    const active = cleanFlights.filter((flight) => {
      if (flight.status === "deleted" || flight.deleted) return false
      if (hideCompleted && flight.status === "completed") return false
      return true
    });
    
    // Use the new display order function which handles both sorting and numbering
    const numberedAndSorted = createDisplayOrder(active);
    
    // Filter deleted flights
    const deleted = hideDeleted ? [] : cleanFlights.filter((flight) => 
      flight.status === "deleted" || flight.deleted
    );
    
    return {
      activeFlights: numberedAndSorted,
      numberedActiveFlights: numberedAndSorted,
      deletedFlights: deleted
    };
  }, [flights, hideCompleted, hideDeleted]);

  // Count completed and deleted flights that are hidden
  useEffect(() => {
    if (hideCompleted) {
      const count = flights.filter((f) => f.status === "completed").length
      setCompletedFlightsCount(count)
    } else {
      setCompletedFlightsCount(0)
    }

    if (hideDeleted) {
      const count = flights.filter((f) => f.status === "deleted" || f.deleted).length
      setDeletedFlightsCount(count)
    } else {
      setDeletedFlightsCount(0)
    }
  }, [flights, hideCompleted, hideDeleted])

  // Check if there are any active flights to display
  const hasActiveFlights = numberedActiveFlights.length > 0

  // Handle duplicating a flight
  const handleDuplicateFlight = async (flight: Flight) => {
    // Prevent rapid clicking
    if (isDuplicating) {
      return;
    }
    
    if (!flight.aircraft) {
      return
    }

    try {
      // Set debounce flag
      setIsDuplicating(true);
      
      // Create a new flight with the same aircraft and pilot(s)
      // Use registration for aircraft lookup instead of the converted integer ID
      const duplicatedFlight = {
        aircraft: {
          id: flight.aircraft.registration, // Use registration as ID for lookup
          registration: flight.aircraft.registration,
          type: flight.aircraft.type,
          isDoubleSeater: flight.aircraft.isDoubleSeater,
          hasFlarm: flight.aircraft.hasFlarm,
          flarmId: flight.aircraft.flarmId,
        },
        pilot: flight.pilot,
        coPilot: flight.coPilot,
        isSchoolFlight: flight.isSchoolFlight,
        startField: flight.startField,
        launchMethod: flight.launchMethod || 'S'
      }
      
      // Call the API to add the new flight
      const response = await fetch('/api/tablet/add_flight', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(duplicatedFlight),
      })

      const data = await response.json()
      
      if (!data.success) {
        // Use standard UI toast for error
        toast({
          title: "Fejl ved duplikering",
          description: data.error || "Der opstod en fejl ved duplikering af flyvningen",
          variant: "destructive",
        })
        return
      }
      
      // Don't create any temporary flights - just wait for WebSocket
      
      // Show success toast
      hotToast.success("Flyvning kopieret", {
        position: 'top-center'
      })
      
    } catch (error) {
      // Use standard UI toast for error
      toast({
        title: "Fejl ved duplikering",
        description: "Der opstod en uventet fejl",
        variant: "destructive",
      })
    } finally {
      // Reset debounce flag after 350ms to prevent race conditions
      // when rapidly clicking duplicate button
      setTimeout(() => {
        setIsDuplicating(false);
      }, 350);
    }
  }

  // Update handler for flight replay
  const handleReplayFlight = (flight: Flight) => {
    if (flight && flight.originalId) {
      setSelectedFlightForReplay({ 
        id: flight.originalId, 
        registration: flight.aircraft.registration 
      });
    } else {
      toast({
        title: "Fejl ved afspilning",
        description: "Kunne ikke finde flydata for denne flyvning",
        variant: "destructive",
      });
    }
  }

  return (
    <TooltipProvider>
      <div className="space-y-3 h-full flex flex-col">
        {/* Main flight list */}
        <div className="flex-1 overflow-y-auto pb-2" ref={flightListRef}>
          {/* Hidden flights disclaimer */}
          {(hideCompleted && completedFlightsCount > 0) || (hideDeleted && deletedFlightsCount > 0) ? (
            <div className="flex items-center gap-1 text-xs text-muted-foreground mb-2 bg-slate-50 p-1.5 rounded-md border border-slate-200">
              <Info className="h-3.5 w-3.5 text-blue-500 flex-shrink-0" />
              <span>
                {hideCompleted && completedFlightsCount > 0 && (
                  <>
                    {completedFlightsCount} tidligere {completedFlightsCount === 1 ? "flyvning" : "flyvninger"}
                    {hideDeleted && deletedFlightsCount > 0 ? " og " : " "}
                  </>
                )}
                {hideDeleted && deletedFlightsCount > 0 && (
                  <>
                    {deletedFlightsCount} slettet {deletedFlightsCount === 1 ? "flyvning " : "flyvninge "}
                  </>
                )}
                 vises ikke, da dette er slået fra i indstillinger
              </span>
            </div>
          ) : null}

          {/* Loading or Flights */}
          {isLoading ? (
            <div className="flex items-center justify-center h-96">
              <div className="text-center">
                <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
                <p className="text-lg text-muted-foreground">Indlæser flyvninger...</p>
              </div>
            </div>
          ) : hasActiveFlights ? (
            <div className="space-y-1.5 px-1 md:px-0">
              {numberedActiveFlights.map((flight) => {
                // Check if this flight was recently updated
                const isRecentlyUpdated = false; // Disable highlighting completely
                
                // Check if flight is missing a pilot when flying or completed
                const missingPilotWarning = 
                  (!flight.pilot || flight.pilot === null) && 
                  (flight.status === 'in_flight' || flight.status === 'completed');
                
                // Get FLARM status if available
                const flarmStatus = flight.aircraft.hasFlarm && flight.aircraft.flarmId 
                  ? flarmStatuses[flight.aircraft.flarmId] || 'unknown'
                  : null;
                
                return (
                  <FlightCard
                    key={flight.id}
                    flight={flight}
                    sequentialNumber={flight.sequentialNumber}
                    onEditClick={handleEditClick}
                    onStartFlight={handleStartFlight}
                    onEndFlight={handleEndFlight}
                    onTimeClick={handleTimeClick}
                    onDuplicate={handleDuplicateFlight}
                    onReplayFlight={handleReplayFlight}
                    getFlightDuration={getFlightDuration}
                    isRecentlyUpdated={isRecentlyUpdated}
                    missingPilotWarning={missingPilotWarning}
                    ref={isRecentlyUpdated ? lastUpdateRef : undefined}
                    tableMode={true}
                    compact={compactMode}
                    flarmStatus={flarmStatus}
                    isDuplicating={isDuplicating}
                    currentClubHomefield={dailyInfo?.club?.homefield}
                    currentAirfield={authenticatedChannel || undefined}
                  />
                );
              })}
            </div>
          ) : (
            // Only show empty state when we're definitely not loading
            !isLoading && <EmptyFlightList />
          )}
        </div>

        {/* Deleted flights section */}
        <DeletedFlightsList flights={deletedFlights} />

        {/* Edit Flight Dialog */}
        <EditFlightDialog
          open={isEditDialogOpen}
          onOpenChange={setIsEditDialogOpen}
          flight={editFlight}
          onSave={handleSaveEdit}
          onDelete={handleDeleteClick}
          onTimeClick={handleTimeClick}
          pilotOptions={[]} // Pass empty array, the real data will come from API
          airfieldOptions={airfieldOptions}
          flarmStatus={editFlight?.aircraft?.hasFlarm && editFlight?.aircraft?.flarmId 
            ? flarmStatuses[editFlight.aircraft.flarmId] || 'unknown'
            : null}
          currentClubHomefield={dailyInfo?.club?.homefield}
          currentAirfield={authenticatedChannel || undefined}
        />

        {/* Time Picker Dialog */}
        <TimePickerDialog
          open={isTimePickerOpen}
          onOpenChange={setIsTimePickerOpen}
          onTimeSelected={handleTimeSelected}
          type={timeEditType}
          currentValue={getCurrentTimeValue()}
        />
        
        {/* Flight Replay Map Dialog */}
        {selectedFlightForReplay && (
          <StatisticsReplayMap 
            flightLogbookId={selectedFlightForReplay.id}
            aircraftRegistration={selectedFlightForReplay.registration}
            onClose={() => setSelectedFlightForReplay(null)}
          />
        )}
      </div>
    </TooltipProvider>
  )
}

// Wrap the page content with Suspense to handle useSearchParams
export default function StartListePage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen w-full flex-col bg-background">
        <div className="flex h-screen items-center justify-center">
          <Loader2 className="mr-2 h-6 w-6 animate-spin" />
          <span>Indlæser startliste...</span>
        </div>
      </div>
    }>
      <StartlistePageContent />
    </Suspense>
  );
}

// Main component using the context
function StartlistePageContent() {
  const {
    // WebSocket state
    wsConnected,
    isAuthenticatedOnWs,
    pingStatus,
    authenticatedChannel,
    socketRef,

    // UI state
    showDisconnectionDialog,
    setShowDisconnectionDialog,
    showRolesDialog,
    setShowRolesDialog,

    // Data state
    dailyInfo,
    tcasAlert,
    airfieldOptions,

    // Functions
    goToSettings,
  } = useStartliste()

  return (
    <div className="flex min-h-screen w-full flex-col bg-background overflow-hidden">
      {/* Offline alert dialog based on WebSocket connection with delay */}
      <AlertDialog open={showDisconnectionDialog} onOpenChange={(open) => {
        // Allow manual dismissal but it will reappear if still disconnected
        if (!open) setShowDisconnectionDialog(false);
      }}>
        <AlertDialogContent>
          <div className="flex flex-col items-center text-center p-2">
            <div className="rounded-full bg-red-100 p-3 mb-4">
              <WifiOff className="h-8 w-8 text-red-600" />
            </div>
            <AlertDialogHeader>
              <AlertDialogTitle className="text-xl">
                Ingen forbindelse til serveren
              </AlertDialogTitle>
              <AlertDialogDescription className="text-base">
                Det ser ud til, at du har mistet forbindelsen til serveren.
                Appen vil automatisk genoprette forbindelsen.
              </AlertDialogDescription>
            </AlertDialogHeader>
            
            <div className="flex items-center justify-center space-x-2 mt-6 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>Forsøger at oprette forbindelse...</span>
            </div>
          </div>
        </AlertDialogContent>
      </AlertDialog>

      {/* Missing roles alert dialog */}
      <AlertDialog open={showRolesDialog} onOpenChange={setShowRolesDialog}>
        <AlertDialogContent>
          <div className="flex flex-col items-center text-center p-2">
            <div className="rounded-full bg-blue-100 p-3 mb-4">
              <User className="h-8 w-8 text-blue-600" />
            </div>
            <AlertDialogHeader>
              <AlertDialogTitle className="text-xl">
                Vælg dagens bemanding
              </AlertDialogTitle>
              <AlertDialogDescription className="text-base">
                For at kunne registrere flyvninger korrekt, skal du angive dagens trafikleder og spilfører.
              </AlertDialogDescription>
            </AlertDialogHeader>
            
            <div className="w-full mt-6">
              <Button 
                variant="default" 
                className="w-full h-12 text-base" 
                onClick={goToSettings}
              >
                <SettingsIcon className="mr-2 h-5 w-5" />
                Gå til indstillinger
              </Button>
            </div>
          </div>
        </AlertDialogContent>
      </AlertDialog>
      
      <main className="flex flex-1 flex-col overflow-hidden">
        {/* Fixed header section - always visible when scrolling */}
        <StartlisteHeader 
          wsConnected={wsConnected} 
          isAuthenticatedOnWs={isAuthenticatedOnWs}
          pingStatus={pingStatus} 
          dailyInfo={dailyInfo}
          tcasAlert={tcasAlert}
        />
        
        {/* Add padding to content to account for fixed header height - adjusted for slimmer mobile header */}
        <div className="h-[calc(8rem+2rem)] md:h-[calc(var(--fixed-header-total-height)+5rem+2.5rem)] flex-shrink-0"></div>
        
        {/* Main content */}
        <div className="flex-1 p-2 pt-6 sm:p-3 m-0 overflow-auto">
          <StartList 
            socket={socketRef.current} 
            wsConnected={wsConnected} 
            dailyInfo={dailyInfo}
            authenticatedChannel={authenticatedChannel}
            airfieldOptions={airfieldOptions}
          />
        </div>
      </main>
    </div>
  )
} 