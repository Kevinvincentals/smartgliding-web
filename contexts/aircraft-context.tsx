"use client"

import React, { createContext, useState, useContext, useEffect, useCallback, useRef } from "react"
import { LiveAircraft } from "@/types/live-map"
import { processAircraftData, subscribePlaneTracker, unsubscribePlaneTracker, setAdsbPreference } from "@/lib/websocket"

// Define the flight track data interfaces
interface FlightTrackPoint {
  latitude: number;
  longitude: number;
  altitude: number | null;
  track: number | null;
  ground_speed: number | null;
  climb_rate: number | null;
  turn_rate: number | null;
  timestamp: string;
}

interface FlightTrackData {
  success: boolean;
  count: number;
  data: FlightTrackPoint[];
}

// Add better typing for club planes
interface ClubPlanesMap {
  [registration: string]: boolean
}

interface AircraftContextType {
  aircraft: LiveAircraft[]
  selectedAircraft: LiveAircraft | null
  setSelectedAircraft: (aircraft: LiveAircraft | null) => void
  isConnected: boolean
  connectionStatus: 'connecting' | 'connected' | 'disconnected' | 'error'
  lastMessage: string
  lastMessageTime: Date | null
  showInSidebar: boolean
  toggleSidebar: () => void
  fetchAircraftTrack: (aircraftId: string) => Promise<void>
  flightTrack: FlightTrackData | null
  isLoadingTrack: boolean
  // Replay functionality
  openFlightReplay: (aircraftRegistration: string) => Promise<void>
  setReplayDialogOpen: (open: boolean) => void
  replayDialogData: { flightLogbookId: string; aircraftRegistration: string } | null
  // Club planes functionality
  showAllPlanes: boolean
  setShowAllPlanes: (show: boolean) => void
  showOnlyFlying: boolean
  setShowOnlyFlying: (show: boolean) => void
  showAdsb: boolean
  setShowAdsb: (show: boolean) => void
  clubPlanes: ClubPlanesMap
  isClubPlane: (registration: string) => boolean
  isFlying: (aircraft: LiveAircraft) => boolean
}

const AircraftContext = createContext<AircraftContextType | null>(null)

export function useAircraft() {
  const context = useContext(AircraftContext)
  if (!context) {
    throw new Error("useAircraft must be used within an AircraftProvider")
  }
  return context
}

interface AircraftProviderProps {
  socket: WebSocket | null
  wsConnected: boolean
  showInSidebar?: boolean
  children: React.ReactNode
}

export function AircraftProvider({
  socket,
  wsConnected,
  showInSidebar: initialShowInSidebar = false,
  children,
}: AircraftProviderProps) {
  // Add unique ID for this provider instance for better debugging
  const providerId = useRef<string>(`aircraft-provider-${Math.random().toString(36).substring(2, 9)}`)
  // Track if we've already subscribed to avoid duplicate subscriptions
  const hasSubscribed = useRef<boolean>(false)
  
  const [aircraft, setAircraft] = useState<LiveAircraft[]>([])
  const [selectedAircraft, setSelectedAircraft] = useState<LiveAircraft | null>(null)
  const selectedAircraftRef = useRef(selectedAircraft); // Add ref for selectedAircraft
  const [isConnected, setIsConnected] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected' | 'error'>('connecting')
  const [lastMessage, setLastMessage] = useState<string>("")
  const [lastMessageTime, setLastMessageTime] = useState<Date | null>(null)
  const [showInSidebar, setShowInSidebar] = useState(initialShowInSidebar)
  const [flightTrack, setFlightTrack] = useState<FlightTrackData | null>(null)
  const [isLoadingTrack, setIsLoadingTrack] = useState(false)
  
  // Replay dialog state
  const [replayDialogData, setReplayDialogData] = useState<{ flightLogbookId: string; aircraftRegistration: string } | null>(null)
  
  // Club planes state
  const [showAllPlanes, setShowAllPlanes] = useState(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('showAllPlanes');
        return saved ? JSON.parse(saved) : false;
      } catch (error) {
        console.error('Error parsing showAllPlanes from localStorage:', error);
        return false;
      }
    }
    return false;
  });
  
  const [showOnlyFlying, setShowOnlyFlying] = useState(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('showOnlyFlying');
        return saved ? JSON.parse(saved) : false;
      } catch (error) {
        console.error('Error parsing showOnlyFlying from localStorage:', error);
        return false;
      }
    }
    return false;
  });
  
  const [showAdsb, setShowAdsb] = useState(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('showAdsb');
        return saved ? JSON.parse(saved) : false; // Default to false
      } catch (error) {
        console.error('Error parsing showAdsb from localStorage:', error);
        return false;
      }
    }
    return false;
  });
  
  const [clubPlanes, setClubPlanes] = useState<ClubPlanesMap>({});
  
  // Save showAllPlanes to localStorage when it changes
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('showAllPlanes', JSON.stringify(showAllPlanes));
      } catch (error) {
        console.error('Error saving showAllPlanes to localStorage:', error);
      }
    }
  }, [showAllPlanes]);
  
  // Save showOnlyFlying to localStorage when it changes
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('showOnlyFlying', JSON.stringify(showOnlyFlying));
      } catch (error) {
        console.error('Error saving showOnlyFlying to localStorage:', error);
      }
    }
  }, [showOnlyFlying]);
  
  // Save showAdsb to localStorage when it changes
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('showAdsb', JSON.stringify(showAdsb));
      } catch (error) {
        console.error('Error saving showAdsb to localStorage:', error);
      }
    }
  }, [showAdsb]);

  // Send ADSB preference to backend when it changes
  useEffect(() => {
    if (socket && socket.readyState === WebSocket.OPEN) {
      setAdsbPreference(socket, showAdsb);
    }
  }, [socket, showAdsb]);

  // Update the ref whenever selectedAircraft changes
  useEffect(() => {
    selectedAircraftRef.current = selectedAircraft;
  }, [selectedAircraft]);

  // Function to toggle sidebar visibility
  const toggleSidebar = useCallback(() => {
    setShowInSidebar(prev => !prev)
  }, [])

  // Function to fetch aircraft track data
  const fetchAircraftTrack = useCallback(async (aircraftId: string) => {
    if (!aircraftId) return;
    
    try {
      setIsLoadingTrack(true);
      console.log(`[${providerId.current}] Fetching flight track for aircraft: ${aircraftId}`);
      
      const response = await fetch(`/api/tablet/fetch_specific_flarm_flight?aircraft_id=${encodeURIComponent(aircraftId)}`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch flight track: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (data.success) {
        // Only store what we need for the flight path display
        setFlightTrack({
          success: data.success,
          count: data.count,
          data: data.data
        });
        console.log(`[${providerId.current}] Successfully fetched ${data.count} track points for aircraft: ${aircraftId}`);
      } else {
        console.error(`[${providerId.current}] API returned error:`, data.error);
        setFlightTrack(null);
      }
    } catch (error) {
      console.error(`[${providerId.current}] Error fetching flight track:`, error);
      setFlightTrack(null);
    } finally {
      setIsLoadingTrack(false);
    }
  }, [providerId]);

  // Function to open flight replay dialog
  const openFlightReplay = useCallback(async (aircraftRegistration: string) => {
    try {
      console.log(`Opening flight replay for aircraft: ${aircraftRegistration}`);
      
      const response = await fetch(`/api/tablet/find-current-flight?registration=${encodeURIComponent(aircraftRegistration)}`);
      
      if (!response.ok) {
        throw new Error(`Failed to find current flight: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (data.success && data.flightLogbookId) {
        setReplayDialogData({
          flightLogbookId: data.flightLogbookId,
          aircraftRegistration: aircraftRegistration
        });
        console.log(`Found flight logbook ID: ${data.flightLogbookId} for aircraft: ${aircraftRegistration}`);
      } else {
        console.error(`No flight found for aircraft: ${aircraftRegistration}`, data.error);
        // Could show a toast notification here
        alert(`Ingen flyvning fundet for ${aircraftRegistration}. ${data.error || ''}`);
      }
    } catch (error) {
      console.error(`Error opening flight replay for ${aircraftRegistration}:`, error);
      alert(`Fejl ved åbning af flyvning genafspilning: ${error instanceof Error ? error.message : 'Ukendt fejl'}`);
    }
  }, []);

  // Function to close replay dialog
  const setReplayDialogOpen = useCallback((open: boolean) => {
    if (!open) {
      setReplayDialogData(null);
    }
  }, []);

  // Handle incoming WebSocket messages
  const handleWebSocketMessage = useCallback((event: MessageEvent) => {
    const data = event.data;
    setLastMessage(typeof data === 'string' ? data.substring(0, 100) : 'Non-string data received'); // For debugging
    setLastMessageTime(new Date());
    
    try {
      // Handle JSON messages
      if (typeof data === 'string' && data.startsWith('{')) {
        const jsonData = JSON.parse(data);
        
        // Update connection status and process aircraft data
        if (jsonData.type === 'aircraft_data' && Array.isArray(jsonData.data)) {
          setIsConnected(true);
          setConnectionStatus('connected');
          
          // Convert aircraft data
          const convertedAircraft = jsonData.data.map(processAircraftData);
          setAircraft(convertedAircraft);
        }
        // Handle ADSB aircraft data
        else if (jsonData.type === 'adsb_aircraft_data' && Array.isArray(jsonData.data)) {
          setIsConnected(true);
          setConnectionStatus('connected');
          
          // Convert ADSB aircraft data
          const convertedAircraft = jsonData.data.map(processAircraftData);
          setAircraft(prev => {
            // Create a map of existing aircraft for faster lookup
            const aircraftMap = new Map(prev.map(a => [a.id, a]));
            
            // Add/update ADSB aircraft
            convertedAircraft.forEach((aircraft: LiveAircraft) => {
              aircraftMap.set(aircraft.id, aircraft);
            });
            
            return Array.from(aircraftMap.values());
          });
        }
        // Handle batch updates of multiple aircraft
        else if (jsonData.type === 'aircraft_batch_update' && Array.isArray(jsonData.data)) {
          setIsConnected(true);
          setConnectionStatus('connected');
          
          // Process all aircraft updates in the batch
          const updatedAircraftData: LiveAircraft[] = jsonData.data.map(processAircraftData);
          
          setAircraft(prev => {
            // Create a map of the current aircraft for faster lookup
            const aircraftMap = new Map(prev.map(a => [a.id, a]));
            
            // Process each updated aircraft
            updatedAircraftData.forEach((updatedAircraft: LiveAircraft) => {
              // Simply update or add the aircraft without timestamp checks
              aircraftMap.set(updatedAircraft.id, updatedAircraft);
            });
            
            // Convert map back to array
            const updatedArray = Array.from(aircraftMap.values());
            
            // If selected aircraft is in the batch, update it
            if (selectedAircraftRef.current) {
              const updatedSelected = updatedArray.find(ac => ac.id === selectedAircraftRef.current!.id);
              if (updatedSelected) {
                setSelectedAircraft(updatedSelected);
              }
            }
            
            return updatedArray;
          });
        }
        // Update a single aircraft (OGN/FLARM)
        else if (jsonData.type === 'aircraft_update' && jsonData.data) {
          setIsConnected(true);
          setConnectionStatus('connected');
          
          const updatedAircraft = processAircraftData(jsonData.data);
          
          setAircraft(prev => {
            // Find if this aircraft already exists
            const index = prev.findIndex(a => a.id === updatedAircraft.id);
            
            if (index >= 0) {
              // Update existing aircraft without timestamp checks
              const updatedList = [...prev];
              updatedList[index] = updatedAircraft;
              return updatedList;
            } else {
              // Add new aircraft
              return [...prev, updatedAircraft];
            }
          });

          // If this is the selected aircraft, update the selectedAircraft state
          if (selectedAircraftRef.current && selectedAircraftRef.current.id === updatedAircraft.id) {
            setSelectedAircraft(updatedAircraft);
          }
        }
        // Update a single ADSB aircraft
        else if (jsonData.type === 'adsb_aircraft_update' && jsonData.data) {
          setIsConnected(true);
          setConnectionStatus('connected');
          
          const updatedAircraft = processAircraftData(jsonData.data);
          
          setAircraft(prev => {
            // Find if this aircraft already exists
            const index = prev.findIndex(a => a.id === updatedAircraft.id);
            
            if (index >= 0) {
              // Update existing aircraft
              const updatedList = [...prev];
              updatedList[index] = updatedAircraft;
              return updatedList;
            } else {
              // Add new aircraft
              return [...prev, updatedAircraft];
            }
          });

          // If this is the selected aircraft, update the selectedAircraft state
          if (selectedAircraftRef.current && selectedAircraftRef.current.id === updatedAircraft.id) {
            setSelectedAircraft(updatedAircraft);
          }
        }
        // Remove an aircraft (OGN/FLARM)
        else if (jsonData.type === 'aircraft_removed' && jsonData.data && jsonData.data.id) {
          setIsConnected(true);
          setConnectionStatus('connected');
          
          const aircraftId = jsonData.data.id;
          setAircraft(prev => prev.filter(a => a.id !== aircraftId));
          
          // Clear selection if the removed aircraft was selected
          if (selectedAircraftRef.current?.id === aircraftId) {
            setSelectedAircraft(null);
          }
        }
        // Remove an ADSB aircraft
        else if (jsonData.type === 'adsb_aircraft_removed' && jsonData.data && (jsonData.data.id || jsonData.data.aircraft_id)) {
          setIsConnected(true);
          setConnectionStatus('connected');
          
          const aircraftId = jsonData.data.aircraft_id || jsonData.data.id;
          setAircraft(prev => prev.filter(a => a.id !== aircraftId));
          
          // Clear selection if the removed aircraft was selected
          if (selectedAircraftRef.current?.id === aircraftId) {
            setSelectedAircraft(null);
          }
        }
        // Handle connection status
        else if (jsonData.type === 'connection') {
          setIsConnected(true);
          setConnectionStatus('connected');
        }
        // Handle subscription confirmations
        else if (jsonData.type === 'subscription' && jsonData.channel === 'plane-tracker') {
          console.log(`[${providerId.current}] Received subscription confirmation:`, jsonData.status);
          if (jsonData.status === 'subscribed') {
            hasSubscribed.current = true;
          }
        }
      } else if (typeof data === 'string' && data === "Connected to plane tracker") {
        // Heartbeat from plane tracker
        setIsConnected(true);
        setConnectionStatus('connected');
      }
    } catch (error) {
      console.error(`[${providerId.current}] Error processing WebSocket message:`, error);
      setConnectionStatus('error');
    }
  }, [
    providerId, 
    setAircraft, 
    setConnectionStatus, 
    setIsConnected, 
    setLastMessage, 
    setLastMessageTime, 
    setSelectedAircraft 
    // selectedAircraft is removed, selectedAircraftRef.current is used instead
    // hasSubscribed.current is a ref, so it doesn't need to be in dependencies
  ]);

  // Update showInSidebar if initialShowInSidebar changes
  useEffect(() => {
    setShowInSidebar(initialShowInSidebar);
  }, [initialShowInSidebar]);

  // WebSocket connection and message handling
  useEffect(() => {
    if (!socket) {
      console.log(`[${providerId.current}] No socket provided, setting status to disconnected`);
      setConnectionStatus('disconnected');
      return;
    }
    
    console.log(`[${providerId.current}] Setting up aircraft WebSocket listeners`);
    
    // Create stable event handlers
    const messageHandler = (event: MessageEvent) => handleWebSocketMessage(event);
    const openHandler = () => {
      console.log(`[${providerId.current}] Aircraft WebSocket connected`);
      setConnectionStatus('connected');
      
      // Only subscribe if we haven't already to avoid duplicate subscriptions
      if (!hasSubscribed.current) {
        console.log(`[${providerId.current}] Subscribing to plane tracker data`);
        subscribePlaneTracker(socket);
        hasSubscribed.current = true;
      } else {
        console.log(`[${providerId.current}] Already subscribed, skipping subscription`);
      }
    };
    
    const closeHandler = () => {
      console.log(`[${providerId.current}] Aircraft WebSocket disconnected`);
      setConnectionStatus('disconnected');
      setIsConnected(false);
      // Reset subscription flag on disconnection
      hasSubscribed.current = false;
    };
    
    const errorHandler = (error: Event) => {
      console.error(`[${providerId.current}] Aircraft WebSocket error:`, error);
      setConnectionStatus('error');
      setIsConnected(false);
    };
    
    // Add event listeners
    socket.addEventListener('message', messageHandler);
    socket.addEventListener('open', openHandler);
    socket.addEventListener('close', closeHandler);
    socket.addEventListener('error', errorHandler);
    
    // If socket is already open, subscribe immediately (if we haven't already)
    if (socket.readyState === WebSocket.OPEN && !hasSubscribed.current) {
      console.log(`[${providerId.current}] Socket already open, subscribing immediately`);
      subscribePlaneTracker(socket);
      hasSubscribed.current = true;
    }
    
    // Cleanup function
    return () => {
      console.log(`[${providerId.current}] Cleaning up aircraft WebSocket listeners`);
      
      // Remove all event listeners
      socket.removeEventListener('message', messageHandler);
      socket.removeEventListener('open', openHandler);
      socket.removeEventListener('close', closeHandler);
      socket.removeEventListener('error', errorHandler);
      
      // Unsubscribe from plane tracker data when component unmounts
      if (socket.readyState === WebSocket.OPEN) {
        console.log(`[${providerId.current}] Aircraft context unmounting, unsubscribing from plane tracker`);
        unsubscribePlaneTracker(socket);
        hasSubscribed.current = false;
      }
    };
  }, [socket, handleWebSocketMessage, providerId]);

  // Send a heartbeat ping every 30 seconds to keep the connection alive
  useEffect(() => {
    if (!socket) return;
    
    const pingInterval = setInterval(() => {
      if (socket && socket.readyState === WebSocket.OPEN) {
        try {
          socket.send(JSON.stringify({ type: 'ping' }));
        } catch (error) {
          console.error(`[${providerId.current}] Error sending ping:`, error);
        }
      }
    }, 30000); // Every 30 seconds
    
    return () => clearInterval(pingInterval);
  }, [socket, providerId]);

  // Fetch club planes on component mount
  useEffect(() => {
    const fetchClubPlanes = async () => {
      try {
        console.log(`[${providerId.current}] Fetching club planes`);
        const response = await fetch('/api/tablet/fetch_planes');
        if (response.ok) {
          const data = await response.json();
          if (data.success) {
            const clubPlanesMap = data.planes.reduce((acc: ClubPlanesMap, plane: any) => {
              acc[plane.registration] = true;
              return acc;
            }, {});
            console.log(`[${providerId.current}] Retrieved ${Object.keys(clubPlanesMap).length} club planes`);
            setClubPlanes(clubPlanesMap);
          } else {
            console.error(`[${providerId.current}] Failed to fetch club planes:`, data.error);
          }
        } else {
          console.error(`[${providerId.current}] Failed to fetch club planes: HTTP ${response.status}`);
        }
      } catch (error) {
        console.error(`[${providerId.current}] Error fetching club planes:`, error);
      }
    };

    fetchClubPlanes();
  }, [providerId]);

  // Helper function to check if an aircraft is a club plane
  const isClubPlane = useCallback((registration: string): boolean => {
    return clubPlanes[registration] === true;
  }, [clubPlanes]);
  
  // Helper function to check if an aircraft is in flight (above 30 km/h)
  const isFlying = useCallback((aircraft: LiveAircraft): boolean => {
    return aircraft.speed > 30 / 1.852; // Convert 30 km/h to knots
  }, []);

  // Helper function to filter out duplicate aircraft and apply ADSB filter
  const filterDuplicatesAndAdsb = useCallback((aircraftList: LiveAircraft[]): LiveAircraft[] => {
    console.log(`Filtering ${aircraftList.length} aircraft, showAdsb: ${showAdsb}`);
    
    // First, filter out aircraft not seen in the last 10 minutes
    const now = new Date();
    const tenMinutesAgo = new Date(now.getTime() - 10 * 60 * 1000); // 10 minutes in milliseconds
    
    let recentAircraft = aircraftList.filter(aircraft => {
      if (!aircraft.lastSeen) {
        // If no lastSeen time, assume it's recent (for backwards compatibility)
        return true;
      }
      
      const lastSeenDate = typeof aircraft.lastSeen === 'string' ? new Date(aircraft.lastSeen) : aircraft.lastSeen;
      return lastSeenDate >= tenMinutesAgo;
    });
    
    console.log(`After 10-minute timeout filter: ${recentAircraft.length} aircraft (removed ${aircraftList.length - recentAircraft.length} old aircraft)`);
    
    // Then, filter out ADSB aircraft if showAdsb is false
    let filteredList = showAdsb ? recentAircraft : recentAircraft.filter(ac => ac.source !== 'adsb');
    console.log(`After ADSB filter: ${filteredList.length} aircraft`);
    
    // Group aircraft by registration
    const registrationGroups = new Map<string, LiveAircraft[]>();
    
    filteredList.forEach(aircraft => {
      const registration = aircraft.registration.toUpperCase();
      if (!registrationGroups.has(registration)) {
        registrationGroups.set(registration, []);
      }
      registrationGroups.get(registration)!.push(aircraft);
    });
    
    // For each registration, pick the best aircraft (prioritize FLARM/OGN over ADSB)
    const deduplicatedAircraft: LiveAircraft[] = [];
    
    registrationGroups.forEach((aircraftGroup, registration) => {
      if (aircraftGroup.length === 1) {
        // No duplicates, just add the aircraft
        deduplicatedAircraft.push(aircraftGroup[0]);
      } else {
        // Multiple aircraft with same registration, prioritize by source
        // Priority: flarm > ogn > adsb
        const priorityOrder = ['flarm', 'ogn', 'adsb'];
        
        let bestAircraft = aircraftGroup[0];
        for (const aircraft of aircraftGroup) {
          const currentPriority = priorityOrder.indexOf(aircraft.source || 'adsb');
          const bestPriority = priorityOrder.indexOf(bestAircraft.source || 'adsb');
          
          if (currentPriority < bestPriority) {
            bestAircraft = aircraft;
          }
        }
        
        console.log(`Duplicate aircraft found for registration ${registration}, keeping ${bestAircraft.source} source (had ${aircraftGroup.length} duplicates)`);
        deduplicatedAircraft.push(bestAircraft);
      }
    });
    
    console.log(`Final filtered aircraft count: ${deduplicatedAircraft.length}`);
    return deduplicatedAircraft;
  }, [showAdsb]);

  // Context value
  const value = {
    aircraft: filterDuplicatesAndAdsb(aircraft),
    selectedAircraft, 
    setSelectedAircraft,
    isConnected,
    connectionStatus,
    lastMessage,
    lastMessageTime,
    showInSidebar,
    toggleSidebar,
    fetchAircraftTrack,
    flightTrack,
    isLoadingTrack,
    // Replay functionality
    openFlightReplay,
    setReplayDialogOpen,
    replayDialogData,
    // Club planes functionality
    showAllPlanes,
    setShowAllPlanes,
    showOnlyFlying,
    setShowOnlyFlying,
    showAdsb,
    setShowAdsb,
    clubPlanes,
    isClubPlane,
    isFlying
  }

  return (
    <AircraftContext.Provider value={value}>
      {children}
    </AircraftContext.Provider>
  )
} 