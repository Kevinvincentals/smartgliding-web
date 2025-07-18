"use client"

import { Suspense, useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Loader2, WifiOff, User, SettingsIcon, FileText, LogOut, History, Shield } from "lucide-react"
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription } from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { TrafficLeaderSetting } from "@/components/settings/traffic-leader-setting"
import { TowPersonSetting } from "@/components/settings/tow-person-setting"
import { DisplaySettings } from "@/components/settings/display-settings"
import { useToast } from "@/components/ui/use-toast"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Reports } from "@/components/settings/reports"
import { HistoricalFlights } from "@/components/settings/historical-flights"
import { StartlisteHeader } from "../components/header"
import { useStartliste } from "@/contexts/startlist-context"
import React from "react"

interface SettingsProps {
  dailyInfo?: any;
  currentAirfield?: string | null;
}

const ACCESS_TOKEN_KEY = process.env.NEXT_PUBLIC_TABLET_ACCESS_TOKEN_KEY || 'tabletAccessToken'
const REFRESH_TOKEN_KEY = process.env.NEXT_PUBLIC_TABLET_REFRESH_TOKEN_KEY || 'tabletRefreshToken'

function Settings({ dailyInfo, currentAirfield }: SettingsProps = {}) {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState("general")
  const [trafficLeaderId, setTrafficLeaderId] = useState("")
  const [customTrafficLeader, setCustomTrafficLeader] = useState("")
  const [towPersonId, setTowPersonId] = useState("")
  const [customTowPerson, setCustomTowPerson] = useState("")
  const [hideCompleted, setHideCompleted] = useState(false)
  const [hideDeleted, setHideDeleted] = useState(true)
  const [compactMode, setCompactMode] = useState(false)
  const [schoolEnabled, setSchoolEnabled] = useState(false)
  const [pilotOptions, setPilotOptions] = useState<{ id: string, name: string }[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isSigningOut, setIsSigningOut] = useState(false)
  const [initialLoading, setInitialLoading] = useState(true)
  const [hasFetchedPilots, setHasFetchedPilots] = useState(false)
  const [trafficLeaderName, setTrafficLeaderName] = useState("")
  const [towPersonName, setTowPersonName] = useState("")
  const { toast } = useToast()
  
  // Check if club is operating from a different airfield than their home field
  const isOperatingFromDifferentAirfield = currentAirfield && dailyInfo?.club?.homefield && 
                                         currentAirfield !== dailyInfo.club.homefield;
  const rolesRequired = !isOperatingFromDifferentAirfield;
  
  // Fetch pilots from API once
  const fetchPilots = async () => {
    if (pilotOptions.length > 0 || isLoading || hasFetchedPilots) return;
    
    setIsLoading(true)
    try {
      console.log('Fetching pilots data')
      const response = await fetch('/api/tablet/fetch_pilots')
      if (!response.ok) {
        throw new Error('Failed to fetch pilots')
      }
      
      const data = await response.json()
      if (data.success && data.pilots) {
        console.log('Pilots loaded:', data.pilots.length)
        setPilotOptions(data.pilots)
        setHasFetchedPilots(true)
      }
    } catch (error) {
      console.error('Error fetching pilots:', error)
      toast({
        title: "Fejl ved hentning af piloter",
        description: "Kunne ikke hente pilotlisten. Prøv igen senere.",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  // Initialize from dailyInfo prop
  useEffect(() => {
    if (dailyInfo) {
      // Set traffic leader ID if exists
      if (dailyInfo.trafficLeaderId) {
        setTrafficLeaderId(dailyInfo.trafficLeaderId)
      }
      
      // Set tow person ID if exists
      if (dailyInfo.towPersonId) {
        setTowPersonId(dailyInfo.towPersonId)
      }
    }
  }, [dailyInfo])

  // Load settings and fetch pilots on component mount
  useEffect(() => {
    const loadSettings = async () => {
      setInitialLoading(true)
      
      // Load the hideCompleted and hideDeleted settings from localStorage
      const storedHideCompleted = localStorage.getItem("hideCompleted")
      if (storedHideCompleted) {
        setHideCompleted(storedHideCompleted === "true")
      }

      const storedHideDeleted = localStorage.getItem("hideDeleted")
      if (storedHideDeleted !== null) {
        setHideDeleted(storedHideDeleted === "true")
      } else {
        // Set default to true if not set yet
        localStorage.setItem("hideDeleted", "true")
      }
      
      // Load compact mode setting
      const storedCompactMode = localStorage.getItem("compactMode")
      if (storedCompactMode !== null) {
        setCompactMode(storedCompactMode === "true")
      } else {
        // Set default to false if not set yet
        localStorage.setItem("compactMode", "false")
      }
      
      // Load school enabled setting
      const storedSchoolEnabled = localStorage.getItem("schoolEnabled")
      if (storedSchoolEnabled !== null) {
        setSchoolEnabled(storedSchoolEnabled === "true")
      } else {
        // Set default to false (disabled)
        localStorage.setItem("schoolEnabled", "false")
      }
      
      // Fetch pilots data when the component mounts
      await fetchPilots()
      
      setInitialLoading(false)
    }
    
    loadSettings()
  }, [])

  // Update traffic leader name when pilot options or ID changes
  useEffect(() => {
    if (trafficLeaderId && pilotOptions.length > 0) {
      const selectedPilot = pilotOptions.find(pilot => pilot.id === trafficLeaderId);
      if (selectedPilot) {
        setTrafficLeaderName(selectedPilot.name);
      }
    } else {
      setTrafficLeaderName("");
    }
  }, [trafficLeaderId, pilotOptions]);

  // Update tow person name when pilot options or ID changes
  useEffect(() => {
    if (towPersonId && pilotOptions.length > 0) {
      const selectedPilot = pilotOptions.find(pilot => pilot.id === towPersonId);
      if (selectedPilot) {
        setTowPersonName(selectedPilot.name);
      }
    } else {
      setTowPersonName("");
    }
  }, [towPersonId, pilotOptions]);

  // Create a memoized onFocus function that doesn't trigger redundant fetches
  const handleFocus = React.useCallback(() => {
    // Skip the fetch if already loaded or loading
    if (pilotOptions.length === 0 && !isLoading && !hasFetchedPilots) {
      fetchPilots()
    }
  }, [pilotOptions.length, isLoading, hasFetchedPilots])

  // Save traffic leader selection to the database
  const updateTrafficLeader = async (id: string) => {
    try {
      const response = await fetch('/api/tablet/daily_info', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          trafficLeaderId: id
        }),
      })
      
      if (!response.ok) {
        throw new Error('Failed to update traffic leader')
      }
      
      const data = await response.json()
      if (data.success) {
        toast({
          title: "Trafikleder opdateret",
          description: "Trafiklederen er blevet gemt",
          variant: "default",
        })
      }
    } catch (error) {
      console.error('Error updating traffic leader:', error)
      toast({
        title: "Fejl ved opdatering",
        description: "Kunne ikke gemme trafikleder",
        variant: "destructive",
      })
    }
  }
  
  // Save tow person selection to the database
  const updateTowPerson = async (id: string) => {
    try {
      const response = await fetch('/api/tablet/daily_info', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          towPersonId: id
        }),
      })
      
      if (!response.ok) {
        throw new Error('Failed to update tow person')
      }
      
      const data = await response.json()
      if (data.success) {
        toast({
          title: "Spilfører opdateret",
          description: "Spilfører er blevet gemt",
          variant: "default",
        })
      }
    } catch (error) {
      console.error('Error updating tow person:', error)
      toast({
        title: "Fejl ved opdatering",
        description: "Kunne ikke gemme spilpasser",
        variant: "destructive",
      })
    }
  }

  // Set traffic leader ID and update database
  const handleTrafficLeaderChange = (id: string) => {
    setTrafficLeaderId(id)
    updateTrafficLeader(id)
  }
  
  // Set tow person ID and update database
  const handleTowPersonChange = (id: string) => {
    setTowPersonId(id)
    updateTowPerson(id)
  }

  // Clear traffic leader assignment
  const clearTrafficLeader = async () => {
    try {
      const response = await fetch('/api/tablet/daily_info', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          trafficLeaderId: null
        }),
      })
      
      if (!response.ok) {
        throw new Error('Failed to clear traffic leader')
      }
      
      const data = await response.json()
      if (data.success) {
        setTrafficLeaderId("")
        setCustomTrafficLeader("")
        toast({
          title: "Trafikleder fjernet",
          description: "Trafiklederen er blevet fjernet",
          variant: "default",
        })
      }
    } catch (error) {
      console.error('Error clearing traffic leader:', error)
      toast({
        title: "Fejl ved fjernelse",
        description: "Kunne ikke fjerne trafikleder",
        variant: "destructive",
      })
    }
  }

  // Clear tow person assignment
  const clearTowPerson = async () => {
    try {
      const response = await fetch('/api/tablet/daily_info', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          towPersonId: null
        }),
      })
      
      if (!response.ok) {
        throw new Error('Failed to clear tow person')
      }
      
      const data = await response.json()
      if (data.success) {
        setTowPersonId("")
        setCustomTowPerson("")
        toast({
          title: "Spilfører fjernet",
          description: "Spilføreren er blevet fjernet",
          variant: "default",
        })
      }
    } catch (error) {
      console.error('Error clearing tow person:', error)
      toast({
        title: "Fejl ved fjernelse",
        description: "Kunne ikke fjerne spilpasser",
        variant: "destructive",
      })
    }
  }

  // Update hideCompleted setting in localStorage
  useEffect(() => {
    localStorage.setItem("hideCompleted", hideCompleted.toString())
    window.dispatchEvent(new Event("hideCompletedChanged"))
  }, [hideCompleted])

  // Update hideDeleted setting in localStorage
  useEffect(() => {
    localStorage.setItem("hideDeleted", hideDeleted.toString())
    window.dispatchEvent(new Event("hideDeletedChanged"))
  }, [hideDeleted])
  
  // Update compactMode setting in localStorage
  useEffect(() => {
    localStorage.setItem("compactMode", compactMode.toString())
    window.dispatchEvent(new Event("compactModeChanged"))
  }, [compactMode])

  // Update schoolEnabled setting in localStorage
  useEffect(() => {
    localStorage.setItem("schoolEnabled", schoolEnabled.toString())
    window.dispatchEvent(new Event("schoolEnabledChanged"))
  }, [schoolEnabled])

  // Handle tab change
  const handleTabChange = (value: string) => {
    setActiveTab(value);
  };

  const handleSignOut = async () => {
    setIsSigningOut(true)
    try {
      const response = await fetch('/api/tablet/auth/signout', {
        method: 'POST',
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Sign-out failed');
      }
      localStorage.removeItem(ACCESS_TOKEN_KEY);
      localStorage.removeItem(REFRESH_TOKEN_KEY);
      toast({
        title: "Logget ud",
        description: "Du er nu logget ud.",
        variant: "default",
      });
      router.push('/auth'); 
    } catch (error: any) {
      console.error('Error signing out:', error);
      toast({
        title: "Fejl ved udlogning",
        description: error.message || "Kunne ikke logge ud. Prøv igen.",
        variant: "destructive",
      });
    } finally {
      setIsSigningOut(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        <TabsList className="w-full h-14 rounded-lg mb-6">
          <TabsTrigger 
            value="general" 
            className="text-sm flex-1 h-full rounded-md data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
          >
            <SettingsIcon className="h-4 w-4 mr-1" />
            Generelt
          </TabsTrigger>
          <TabsTrigger 
            value="reports" 
            className="text-sm flex-1 h-full rounded-md data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
          >
            <FileText className="h-4 w-4 mr-1" />
            Rapporter
          </TabsTrigger>
          <TabsTrigger 
            value="historical" 
            className="text-sm flex-1 h-full rounded-md data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
          >
            <History className="h-4 w-4 mr-1" />
            Historiske
          </TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="mt-0">
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl">Indstillinger</CardTitle>
              <CardDescription>Konfigurer dine præferencer for dashboardet</CardDescription>
            </CardHeader>
            <CardContent className="space-y-8">
              {/* Role requirement status */}
              {isOperatingFromDifferentAirfield && (
                <div className="rounded-lg border bg-blue-50 p-4">
                  <div className="flex items-start gap-2">
                    <div className="rounded-full bg-blue-100 p-1">
                      <User className="h-4 w-4 text-blue-600" />
                    </div>
                    <div className="flex-1">
                      <h4 className="text-sm font-medium text-blue-900">
                        Bemanding er valgfri
                      </h4>
                      <p className="text-sm text-blue-700 mt-1">
                        Da du opererer fra {currentAirfield} (ikke jeres hjemmeflyveplads {dailyInfo?.club?.homefield}), 
                        er trafikleder og spilfører valgfrie roller.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <TrafficLeaderSetting
                pilots={pilotOptions}
                trafficLeaderId={trafficLeaderId}
                setTrafficLeaderId={handleTrafficLeaderChange}
                customTrafficLeader={customTrafficLeader}
                setCustomTrafficLeader={setCustomTrafficLeader}
                isLoading={isLoading}
                isInitialLoading={initialLoading}
                onFocus={handleFocus}
                onClear={clearTrafficLeader}
              />

              <TowPersonSetting
                pilots={pilotOptions}
                towPersonId={towPersonId}
                setTowPersonId={handleTowPersonChange}
                customTowPerson={customTowPerson}
                setCustomTowPerson={setCustomTowPerson}
                isLoading={isLoading}
                isInitialLoading={initialLoading}
                onFocus={handleFocus}
                onClear={clearTowPerson}
              />

              <DisplaySettings
                hideCompleted={hideCompleted}
                setHideCompleted={setHideCompleted}
                hideDeleted={hideDeleted}
                setHideDeleted={setHideDeleted}
                compactMode={compactMode}
                setCompactMode={setCompactMode}
                schoolEnabled={schoolEnabled}
                setSchoolEnabled={setSchoolEnabled}
                isLoading={initialLoading}
              />

              <div className="pt-4 border-t space-y-3">
                <Button 
                  variant="outline" 
                  onClick={() => router.push('/club/admin/auth')}
                  className="w-full sm:w-auto"
                >
                  <Shield className="mr-2 h-4 w-4" />
                  Club Admin
                </Button>
                
                <Button 
                  variant="destructive" 
                  onClick={handleSignOut} 
                  disabled={isSigningOut}
                  className="w-full sm:w-auto"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  {isSigningOut ? "Logger ud..." : "Log ud"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="reports" className="mt-0">
          <Reports 
            isLoading={initialLoading} 
            trafficLeader={trafficLeaderName}
            towPerson={towPersonName}
          />
        </TabsContent>

        <TabsContent value="historical" className="mt-0">
          <HistoricalFlights 
            isLoading={initialLoading} 
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}

// Wrap the page content with Suspense
export default function SettingsPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen w-full flex-col bg-background">
        <div className="flex h-screen items-center justify-center">
          <Loader2 className="mr-2 h-6 w-6 animate-spin" />
          <span>Indlæser indstillinger...</span>
        </div>
      </div>
    }>
      <SettingsPageContent />
    </Suspense>
  );
}

// Main component using the context
function SettingsPageContent() {
  const {
    // WebSocket state
    wsConnected,
    isAuthenticatedOnWs,
    pingStatus,
    socketRef,

    // UI state
    showDisconnectionDialog,
    setShowDisconnectionDialog,
    showRolesDialog,
    setShowRolesDialog,

    // Data state
    dailyInfo,
    tcasAlert,
    currentAirfield,

    // Functions
    goToSettings,
  } = useStartliste()

  // Check if club is operating from a different airfield than their home field
  const isOperatingFromDifferentAirfield = currentAirfield && dailyInfo?.club?.homefield && 
                                         currentAirfield !== dailyInfo.club.homefield;
  const rolesRequired = !isOperatingFromDifferentAirfield;

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
                {rolesRequired ? (
                  "For at kunne registrere flyvninger korrekt, skal du angive dagens trafikleder og spilfører."
                ) : (
                  `Da du opererer fra ${currentAirfield} (ikke jeres hjemmeflyveplads), er bemanding valgfri, men kan stadig indstilles.`
                )}
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
        
        {/* Add padding to content to account for fixed header height */}
        <div className="h-[calc(3rem+2.5rem)] md:h-[var(--fixed-header-total-height)] flex-shrink-0"></div>
        
        {/* Main content */}
        <div className="flex-1 p-2 pt-4 sm:p-3 m-0 overflow-auto">
          <Settings dailyInfo={dailyInfo} currentAirfield={currentAirfield} />
        </div>
      </main>
    </div>
  )
} 