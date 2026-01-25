"use client"

import { Suspense, useEffect, useRef, useState } from "react"
import { Loader2, WifiOff, User, SettingsIcon } from "lucide-react"
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription } from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { TooltipProvider } from "@/components/ui/tooltip"
import dynamic from "next/dynamic"
import { StartlisteHeader } from "../components/header"
import { useStartliste } from "@/contexts/startlist-context"
import { AircraftPanel } from "@/components/livemap/aircraft-panel"
import { MobileAircraftDrawer } from "@/components/livemap/mobile-aircraft-drawer"
import { AircraftProvider, useAircraft } from "@/contexts/aircraft-context"
import { useIsMobile } from "@/hooks/use-mobile"

// Dynamically import MapPlaceholder with ssr disabled
const MapPlaceholder = dynamic(
  () => import("@/components/livemap/map-placeholder").then((mod) => mod.MapPlaceholder),
  { 
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center w-full h-full bg-slate-100">
        <div className="text-lg text-slate-500">Indlæser kort...</div>
      </div>
    )
  }
)

// Dynamically import StatisticsReplayMap with ssr disabled
const StatisticsReplayMap = dynamic(
  () => import("@/components/statistics/map").then((mod) => mod.StatisticsReplayMap),
  { 
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center w-full h-full">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    )
  }
)

interface LiveMapProps {
  socket: WebSocket | null;
  wsConnected: boolean;
}

// Inner component that has access to the aircraft context
function LiveMapContent() {
  const mapRef = useRef<HTMLDivElement>(null)
  const [map, setMap] = useState<any>(null)
  const { showInSidebar, replayDialogData, setReplayDialogOpen } = useAircraft()

  // Initialize map
  useEffect(() => {
    // Only run this on the client side
    if (typeof window !== "undefined" && mapRef.current && !map) {
      console.log("Initializing map...")

      // Simulate map initialization
      const mockMap = {
        id: "map-instance",
        center: [55.7033, 12.0821],
        zoom: 12,
      }

      setMap(mockMap)
    }
  }, [map])

  return (
    <div className="fixed inset-0 pt-16 md:pt-[120px] flex">
      {/* Map area */}
      <div 
        ref={mapRef} 
        className="bg-slate-100 flex-1"
      >
        <MapPlaceholder 
          isLoading={!map}
        />
      </div>

      {/* Aircraft panel - hidden on mobile */}
      <AircraftPanel />
      
      {/* Mobile aircraft drawer - only visible on mobile */}
      <MobileAircraftDrawer />
      
      {/* Statistics Replay Map Dialog */}
      {replayDialogData && (
        <StatisticsReplayMap 
          flightLogbookId={replayDialogData.flightLogbookId}
          aircraftRegistration={replayDialogData.aircraftRegistration}
          onClose={() => setReplayDialogOpen(false)}
        />
      )}
    </div>
  )
}

function LiveMap({ socket, wsConnected }: LiveMapProps) {
  // Add effect to prevent body scrolling when component mounts
  useEffect(() => {
    // Save the original overflow style
    const originalStyle = window.getComputedStyle(document.body).overflow

    // Prevent scrolling on the body
    document.body.style.overflow = "hidden"

    // Restore original style when component unmounts
    return () => {
      document.body.style.overflow = originalStyle
    }
  }, [])

  return (
    <AircraftProvider socket={socket} wsConnected={wsConnected} showInSidebar={true}>
      <LiveMapContent />
    </AircraftProvider>
  )
}

// Wrap the page content with Suspense
export default function LiveMapPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen w-full flex-col bg-background">
        <div className="flex h-screen items-center justify-center">
          <Loader2 className="mr-2 h-6 w-6 animate-spin" />
          <span>Indlæser livekort...</span>
        </div>
      </div>
    }>
      <LiveMapPageContent />
    </Suspense>
  );
}

// Main component using the context
function LiveMapPageContent() {
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

    // Functions
    goToSettings,
  } = useStartliste()
  
  const isMobile = useIsMobile()

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
          isLivemap={true}
        />
        
        {/* Add padding to content to account for fixed header height */}
        <div className={`${isMobile ? 'h-[52px]' : 'h-[calc(4rem+3.5rem)] md:h-[var(--fixed-header-total-height)]'} flex-shrink-0`}></div>

        {/* Main content - full screen for map, with bottom padding on mobile for nav */}
        <div className={`flex-1 p-0 m-0 border-none ${isMobile ? 'pb-[72px]' : ''}`}>
          <LiveMap socket={socketRef.current} wsConnected={wsConnected} />
        </div>
      </main>
    </div>
  )
} 