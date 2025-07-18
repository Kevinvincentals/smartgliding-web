"use client"

import React, { createContext, useContext, useState, useRef, useEffect, ReactNode } from 'react'
import { useToast } from "@/components/ui/use-toast"
import { useRouter, usePathname } from "next/navigation"
import { toast as hotToast, Toaster } from 'react-hot-toast'
import { PlaneTakeoff, PlaneLanding } from 'lucide-react'

// Types
interface StartlisteContextType {
  // WebSocket state
  wsConnected: boolean
  isAuthenticatedOnWs: boolean
  pingStatus: 'pending' | 'success' | 'failed'
  authenticatedChannel: string | null
  socketRef: React.MutableRefObject<WebSocket | null>

  // UI state
  currentPage: string
  showDisconnectionDialog: boolean
  setShowDisconnectionDialog: (show: boolean) => void
  showRolesDialog: boolean
  setShowRolesDialog: (show: boolean) => void
  addFlightDialogOpen: boolean
  setAddFlightDialogOpen: (open: boolean) => void

  // Data state
  dailyInfo: any
  setDailyInfo: (info: any) => void
  tcasAlert: any
  setTcasAlert: (alert: any) => void
  airfieldOptions: any[]
  setAirfieldOptions: (options: any[]) => void
  currentAirfield: string | null
  setCurrentAirfield: (airfield: string | null) => void

  // Functions
  navigateToPage: (page: string) => void
  goToSettings: () => void
  handleAddFlight: (aircraft: any, pilot: any, coPilot: any, isSchoolFlight: boolean, startField: string, launchMethod: string, socket: WebSocket | null) => void
  playNotificationSound: () => void
}

const StartlisteContext = createContext<StartlisteContextType | undefined>(undefined)

export function useStartliste() {
  const context = useContext(StartlisteContext)
  if (context === undefined) {
    throw new Error('useStartliste must be used within a StartlisteProvider')
  }
  return context
}

interface StartlisteProviderProps {
  children: ReactNode
}

export function StartlisteProvider({ children }: StartlisteProviderProps) {
  const router = useRouter()
  const pathname = usePathname()
  const { toast } = useToast()

  // WebSocket state
  const [wsConnected, setWsConnected] = useState(false)
  const [isAuthenticatedOnWs, setIsAuthenticatedOnWs] = useState(false)
  const [pingStatus, setPingStatus] = useState<'pending' | 'success' | 'failed'>('pending')
  const [authenticatedChannel, setAuthenticatedChannel] = useState<string | null>(null)

  // UI state - derive current page from pathname
  const currentPage = pathname === '/startliste' ? 'startlist' : 
                     pathname === '/startliste/livemap' ? 'livemap' :
                     pathname === '/startliste/school' ? 'school' :
                     pathname === '/startliste/settings' ? 'settings' :
                     pathname === '/startliste/statistics' ? 'statistics' : 'startlist'
  
  const [showDisconnectionDialog, setShowDisconnectionDialog] = useState(false)
  const [showRolesDialog, setShowRolesDialog] = useState(false)
  const [addFlightDialogOpen, setAddFlightDialogOpen] = useState(false)

  // Data state
  const [dailyInfo, setDailyInfo] = useState<any>(null)
  const [tcasAlert, setTcasAlert] = useState<any>(null)
  const [airfieldOptions, setAirfieldOptions] = useState<any[]>([])
  const [currentAirfield, setCurrentAirfield] = useState<string | null>(null)

  // Refs
  const disconnectionTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const socketRef = useRef<WebSocket | null>(null)
  const reconnectAttemptsRef = useRef(0)
  const maxReconnectAttempts = 15
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const heartbeatTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const wasConnected = useRef(false)
  const isComponentMountedRef = useRef(true)
  const notificationSoundRef = useRef<HTMLAudioElement | null>(null)
  const recentFlarmWebhookRef = useRef<{event: string, timestamp: number} | null>(null)
  const activeToastRef = useRef<string | null>(null) // Track active toast ID

  // Initialize notification sound
  useEffect(() => {
    notificationSoundRef.current = new Audio('/notification.wav')
    return () => {
      notificationSoundRef.current = null
    }
  }, [])

  // Play notification sound function
  const playNotificationSound = () => {
    if (notificationSoundRef.current) {
      notificationSoundRef.current.currentTime = 0
      notificationSoundRef.current.play().catch(error => {
        console.error("Error playing notification sound:", error)
      })
    }
  }

  // Remove hash-based navigation (no longer needed with Next.js routing)
  // Handle wsConnected changes with delay for disconnection dialog
  useEffect(() => {
    if (disconnectionTimeoutRef.current) {
      clearTimeout(disconnectionTimeoutRef.current);
      disconnectionTimeoutRef.current = null;
    }
    
    if (!wsConnected) {
      disconnectionTimeoutRef.current = setTimeout(() => {
        if (isComponentMountedRef.current && !wsConnected) {
          setShowDisconnectionDialog(true);
        }
      }, 7000);
    } else {
      setShowDisconnectionDialog(false);
    }
    
    return () => {
      if (disconnectionTimeoutRef.current) {
        clearTimeout(disconnectionTimeoutRef.current);
      }
    };
  }, [wsConnected]);

  // Fetch daily info on component mount
  useEffect(() => {
    const fetchData = async () => {
      try {
        const dailyInfoResponse = await fetch('/api/tablet/daily_info');
        
        if (!dailyInfoResponse.ok) {
          const errorStatus = dailyInfoResponse.status;
          let errorData = { error: 'Unknown error' };
          try {
            errorData = await dailyInfoResponse.json();
          } catch (e) {
            // Ignore if response is not json
          }

          if (errorStatus === 401 || (errorData.error && typeof errorData.error === 'string' && errorData.error.toLowerCase().includes('auth'))) {
            console.warn(`Daily info fetch failed with auth error (${errorStatus}): ${errorData.error}. Redirecting to /auth.`);
            toast({
              title: "Godkendelse Påkrævet",
              description: "Din session er muligvis udløbet. Log venligst ind igen.",
              variant: "destructive",
            });
            router.push('/auth');
            return;
          }
          throw new Error(`Failed to fetch daily info: ${errorStatus} - ${errorData.error}`);
        }
        
        const dailyData = await dailyInfoResponse.json();
        
        if (dailyData.success) {
          if (dailyData.dailyInfo) {
            setDailyInfo(dailyData.dailyInfo);
            
            const hasTrafficLeader = !!dailyData.dailyInfo.trafficLeaderId;
            const hasTowPerson = !!dailyData.dailyInfo.towPersonId;
            
            // Check if club is operating from a different airfield than their home field
            const isOperatingFromDifferentAirfield = currentAirfield && dailyData.dailyInfo.club?.homefield && 
                                                   currentAirfield !== dailyData.dailyInfo.club.homefield;
            
            // Only require roles if operating from home airfield
            const rolesRequired = !isOperatingFromDifferentAirfield;
            
            if (rolesRequired && (!hasTrafficLeader || !hasTowPerson)) {
              if (currentPage !== "settings" && currentPage !== "statistics") {
                setShowRolesDialog(true);
              }
            }
          } else {
            // No daily info exists yet - only show roles dialog if operating from home airfield
            const isOperatingFromDifferentAirfield = currentAirfield && dailyInfo?.club?.homefield && 
                                                   currentAirfield !== dailyInfo?.club.homefield;
            const rolesRequired = !isOperatingFromDifferentAirfield;
            
            setDailyInfo(null);
            if (rolesRequired && currentPage !== "settings" && currentPage !== "statistics") {
              setShowRolesDialog(true);
            }
          }
        } else {
          console.error('Failed to load daily info:', dailyData.error);
        }
      } catch (error) {
        console.error('Error fetching data:', error);
      }
    };
    
    fetchData();
  }, [currentPage, currentAirfield, toast, router]);

  // Fetch airfield options and current airfield
  useEffect(() => {
    const fetchAirfieldOptions = async () => {
      try {
        const response = await fetch('/api/tablet/fetch_club_fields');
        if (response.ok) {
          const data = await response.json();
          if (data.success && data.airfieldOptions) {
            setAirfieldOptions(data.airfieldOptions);
          }
        }
      } catch (error) {
        console.error('Error fetching airfield options:', error);
      }
    };

    const fetchCurrentAirfield = async () => {
      try {
        const response = await fetch('/api/tablet/me');
        if (response.ok) {
          const data = await response.json();
          if (data.success && data.selectedAirfield) {
            setCurrentAirfield(data.selectedAirfield);
          }
        }
      } catch (error) {
        console.error('Error fetching current airfield:', error);
      }
    };
    
    fetchAirfieldOptions();
    fetchCurrentAirfield();
  }, []);

  // WebSocket message handler
  const handleWebSocketMessage = (event: MessageEvent) => {
    try {
      const messageData = event.data.toString();
      if (!messageData.startsWith('{')) {
        return;
      }
      const data = JSON.parse(messageData);
      
      if (data.type === 'daily_info_update') {
        setDailyInfo(data.data);
      } else if (data.type === 'pong') {
        setPingStatus('success');
        if (heartbeatTimeoutRef.current) {
          clearTimeout(heartbeatTimeoutRef.current);
          heartbeatTimeoutRef.current = null;
        }
      } else if (data.type === 'auth_success') {
        setAuthenticatedChannel(data.channel);
        setIsAuthenticatedOnWs(true);
        toast({
          title: "Godkendt",
          description: `Forbundet til WebSocket kanal: ${data.channel}`,
          variant: "default",
        });
      } else if (data.type === 'auth_failure') {
        console.error(`Authentication failed: ${data.message}`);
        setAuthenticatedChannel(null);
        setIsAuthenticatedOnWs(false);
        toast({
          title: "WebSocket Godkendelse Fejlet",
          description: data.message || "Kunne ikke godkende med serveren via cookie. Prøv at logge ind igen.",
          variant: "destructive",
        });
        router.push('/auth'); 
        if (socketRef.current) {
          socketRef.current.close(1008, "Authentication Failed, redirecting to /auth");
        }
      } else if (data.type === 'auth_required') {
        console.warn("Server requires WebSocket authentication (cookie likely missing/invalid):", data.message);
        setAuthenticatedChannel(null); 
        setIsAuthenticatedOnWs(false);
        toast({
          title: "WebSocket Godkendelse Påkrævet",
          description: data.message || "Log ind for at etablere WebSocket forbindelse.",
          variant: "default",
        });
        router.push('/auth');
        if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
          socketRef.current.close(1000, "Client redirecting to /auth; auth_required received");
        }
      } else if (data.type === 'error' && data.message?.includes('Authentication required')) {
        console.warn("Received WebSocket error indicating authentication is required. Redirecting to /auth.");
        setIsAuthenticatedOnWs(false);
        toast({
          title: "Godkendelse Påkrævet",
          description: "Du skal logge ind for at fortsætte.",
          variant: "destructive",
        });
        router.push('/auth');
        if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
          socketRef.current.close(1000, "Client redirecting to auth page due to auth error from server");
        }
      } else if (data.type === 'flight_update') {
        // Show toast for takeoff/landing events with full aircraft info, but only if triggered by FLARM webhook
        const isTakeoffEvent = data.event === 'takeoff' || data.event === 'udtakeoff' || data.event === 'flight_takeoff';
        const isLandingEvent = data.event === 'landing' || data.event === 'udlanding' || data.event === 'flight_landing';
        
        if (isTakeoffEvent || isLandingEvent) {
          // Check if this flight_update was triggered by a recent FLARM webhook (within last 5 seconds)
          const recentWebhook = recentFlarmWebhookRef.current;
          const isFromFlarmWebhook = recentWebhook && 
            (Date.now() - recentWebhook.timestamp < 5000) && // Within 5 seconds
            ((isTakeoffEvent && (recentWebhook.event === 'takeoff' || recentWebhook.event === 'udtakeoff')) ||
             (isLandingEvent && (recentWebhook.event === 'landing' || recentWebhook.event === 'udlanding')));
          
          if (isFromFlarmWebhook) {
            // Clear the webhook flag since we've processed it
            recentFlarmWebhookRef.current = null;
            
            // Get aircraft registration from the detailed flight data
            const aircraftInfo = data.data?.registration || data.data?.plane?.registration_id || data.data?.flarm_id || 'Unknown';
            const eventText = isTakeoffEvent ? 'Start' : 'Landing';
            
            // Dismiss any existing toast before showing new one
            if (activeToastRef.current) {
              hotToast.dismiss(activeToastRef.current);
            }
            
            // Show new toast and store its ID
            const toastId = hotToast((t) => (
              <div className="flex items-center gap-3 p-1">
                <img 
                  src="/images/flarm-logo.png" 
                  alt="FLARM" 
                  className="w-8 h-8 object-contain"
                />
                <div className="flex flex-col">
                  <span className="font-semibold text-gray-900">
                    {eventText} - {aircraftInfo}
                  </span>
                  <span className="text-xs text-gray-600">
                    via FLARM
                  </span>
                </div>
                <div className="text-green-600">
                  {isTakeoffEvent ? (
                    <PlaneTakeoff className="w-5 h-5" />
                  ) : (
                    <PlaneLanding className="w-5 h-5" />
                  )}
                </div>
              </div>
            ), {
              id: `flarm-${Date.now()}`, // Unique ID for each toast
              duration: 4000,
              position: 'top-center',
              style: {
                background: '#ffffff',
                color: '#111827',
                minWidth: '250px',
                border: '1px solid #e5e7eb',
                boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
              },
            });
            
            activeToastRef.current = toastId;
            
            // Clear the active toast reference when it expires
            setTimeout(() => {
              if (activeToastRef.current === toastId) {
                activeToastRef.current = null;
              }
            }, 4000);
          }
        }
      } else if (data.type === 'webhook') {
        // Track FLARM webhook events and play sound
        const isTakeoffEvent = data.event === 'takeoff' || data.event === 'udtakeoff';
        const isLandingEvent = data.event === 'landing' || data.event === 'udlanding';
        
        if (isTakeoffEvent || isLandingEvent) {
          // Mark that we just received a FLARM webhook
          recentFlarmWebhookRef.current = {
            event: data.event,
            timestamp: Date.now()
          };
          playNotificationSound();
        }
      } else if (data.type === 'tcas_alert') {
        if (data.event === 'landing_incursion') {
          setTcasAlert(data.data);
          playNotificationSound();
          
          toast({
            title: "Landingsbane konflikt!",
            description: `Mulig konflikt mellem ${data.data.aircraft.map((ac: {registration: string}) => ac.registration).join(' og ')}`,
            variant: "destructive",
          });
        } else if (data.event === 'clear_incursion') {
          setTcasAlert(null);
          
          toast({
            title: "Landingsbane konflikt afsluttet",
            description: "Konflikten er ikke længere aktiv",
            variant: "default",
          });
        }
      }
    } catch (error) {
      console.error("Error parsing WebSocket message:", error);
    }
  };

  // WebSocket connection setup
  useEffect(() => {
    isComponentMountedRef.current = true;
    let connectionAttemptInProgress = false;
    
    const connectWebSocket = () => {
      if (connectionAttemptInProgress) return;
      connectionAttemptInProgress = true;
      
      try {
        if (socketRef.current) {
          const currentState = socketRef.current.readyState;
          if (currentState === WebSocket.OPEN) {
            connectionAttemptInProgress = false;
            return;
          }
          if (currentState === WebSocket.CONNECTING) {
            connectionAttemptInProgress = false;
            return;
          }
          if (currentState === WebSocket.CLOSING || currentState === WebSocket.CLOSED) {
            socketRef.current = null;
          }
        }
        
        clearAllTimeouts();
        const protocol = window.location.protocol === "https:" ? "wss:" : "ws:"
        const wsUrl = `${protocol}//${window.location.host}/api/ws`
        
        const socket = new WebSocket(wsUrl)
        socketRef.current = socket

        socket.onopen = () => {
          if (!isComponentMountedRef.current) return;
          setWsConnected(true);
          setIsAuthenticatedOnWs(false);
          reconnectAttemptsRef.current = 0;
          
          if (wasConnected.current) {
            toast({
              title: "Forbindelse genoprettet",
              description: "Du vil nu automatisk få opdateringer af flyvninger",
              variant: "default",
            });
          } else {
            toast({
              title: "Live opdateringer aktive",
              description: "Du vil nu automatisk få opdateringer af flyvninger",
              variant: "default",
            });
            wasConnected.current = true;
          }

          setupHeartbeat(socket);
          connectionAttemptInProgress = false;
        }
        
        socket.onmessage = handleWebSocketMessage;

        socket.onclose = (event) => {
          if (!isComponentMountedRef.current) return;
          
          setWsConnected(false);
          setIsAuthenticatedOnWs(false);
          setPingStatus('failed');
          
          clearAllTimeouts();
          
          if (event.code !== 1000) {
            toast({
              title: "Live forbindelse afbrudt",
              description: "Forsøger at genoprette forbindelsen...",
              variant: "destructive",
            });
          }
          
          scheduleReconnect();
          connectionAttemptInProgress = false;
        }

        socket.onerror = (error) => {
          if (!isComponentMountedRef.current) return;
          console.error("WebSocket error:", error);
        }
      } catch (error) {
        console.error("Failed to connect to WebSocket:", error);
        connectionAttemptInProgress = false;
        scheduleReconnect();
      }
    }
    
    const setupHeartbeat = (socket: WebSocket) => {
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
      }
      
      setPingStatus('success');
      
      heartbeatIntervalRef.current = setInterval(() => {
        if (!isComponentMountedRef.current) return;
        
        if (socket.readyState === WebSocket.OPEN) {
          try {
            socket.send(JSON.stringify({ type: 'ping' }));
            
            setPingStatus('pending');
            
            if (heartbeatTimeoutRef.current) {
              clearTimeout(heartbeatTimeoutRef.current);
            }
            
            heartbeatTimeoutRef.current = setTimeout(() => {
              if (!isComponentMountedRef.current) return;
              
              setPingStatus('failed');
              
              if (socketRef.current) {
                try {
                  socketRef.current.close();
                } catch (e) {
                  console.error("Error closing socket:", e);
                }
              }
            }, 3000);
          } catch (e) {
            console.error("Error sending ping:", e);
            setPingStatus('failed');
          }
        }
      }, 10000);
    }
    
    const scheduleReconnect = () => {
      if (!isComponentMountedRef.current) return;
      
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      
      const useAggressive = pingStatus === 'failed';
      
      if (reconnectAttemptsRef.current < maxReconnectAttempts) {
        const baseFactor = useAggressive ? 1.2 : 1.5;
        const baseDelay = useAggressive ? 500 : 1000;
        const backoffTime = Math.min(baseDelay * Math.pow(baseFactor, reconnectAttemptsRef.current), 30000);
        
        reconnectTimeoutRef.current = setTimeout(() => {
          if (!isComponentMountedRef.current) return;
          
          if (document.visibilityState !== 'hidden') {
            reconnectAttemptsRef.current++;
            connectWebSocket();
          }
        }, backoffTime);
      } else {
        const retryInterval = useAggressive ? 5000 : 30000;
        
        reconnectTimeoutRef.current = setTimeout(() => {
          if (!isComponentMountedRef.current) return;
          
          reconnectAttemptsRef.current = Math.max(5, reconnectAttemptsRef.current - 3);
          connectWebSocket();
        }, retryInterval);
      }
    }
    
    const clearAllTimeouts = () => {
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
        heartbeatIntervalRef.current = null;
      }
      
      if (heartbeatTimeoutRef.current) {
        clearTimeout(heartbeatTimeoutRef.current);
        heartbeatTimeoutRef.current = null;
      }
      
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    }
    
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
          connectWebSocket();
        }
      }
    }
    
    connectWebSocket();
    
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      isComponentMountedRef.current = false;
      
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      
      clearAllTimeouts();
      
      if (socketRef.current) {
        try {
          socketRef.current.close(1000, "Component unmounting");
        } catch (e) {
          console.error("Error closing WebSocket:", e);
        }
        socketRef.current = null;
      }
    }
  }, [toast, router]);

  // Functions
  const navigateToPage = (page: string) => {
    const route = page === 'startlist' ? '/startliste' : `/startliste/${page}`
    router.push(route)
  }

  const goToSettings = () => {
    setShowRolesDialog(false);
    router.push('/startliste/settings');
  };

  const handleAddFlight = (aircraft: any, pilot: any, coPilot: any, isSchoolFlight: boolean, startField: string, launchMethod: string, socket: WebSocket | null) => {
    // Flight added logic here
  };

  const contextValue: StartlisteContextType = {
    // WebSocket state
    wsConnected,
    isAuthenticatedOnWs,
    pingStatus,
    authenticatedChannel,
    socketRef,

    // UI state
    currentPage,
    showDisconnectionDialog,
    setShowDisconnectionDialog,
    showRolesDialog,
    setShowRolesDialog,
    addFlightDialogOpen,
    setAddFlightDialogOpen,

    // Data state
    dailyInfo,
    setDailyInfo,
    tcasAlert,
    setTcasAlert,
    airfieldOptions,
    setAirfieldOptions,
    currentAirfield,
    setCurrentAirfield,

    // Functions
    navigateToPage,
    goToSettings,
    handleAddFlight,
    playNotificationSound,
  }

  return (
    <StartlisteContext.Provider value={contextValue}>
      <Toaster 
        position="top-center" 
        toastOptions={{
          duration: 3000,
          style: {
            background: '#363636',
            color: '#fff',
          },
          success: {
            duration: 3000,
          }
        }} 
      />
      {children}
    </StartlisteContext.Provider>
  )
}
