"use client"

import { useState, useEffect } from "react"
import { ClockIcon, User, Wifi, WifiOff, Plus, Plane, MapPin, BarChart2, SettingsIcon, ArrowLeft, GraduationCap } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { useStartliste } from "@/contexts/startlist-context"
import { AddFlightDialog } from "@/components/flights/add-flight-dialog"
import { ChangeAirfieldDialog } from "@/components/dialogs/change-airfield-dialog"
import { useIsMobile } from "@/hooks/use-mobile"
import { cn } from "@/lib/utils"

// Mobile Bottom Navigation Component
interface MobileBottomNavProps {
  currentPage: string;
  navigateToPage: (page: string) => void;
  schoolEnabled: boolean;
}

function MobileBottomNav({ currentPage, navigateToPage, schoolEnabled }: MobileBottomNavProps) {
  return (
    <div className="sm:hidden fixed bottom-0 left-0 right-0 z-50 bg-background border-t border-border shadow-[0_-2px_10px_rgba(0,0,0,0.1)]">
      <div className="flex items-stretch h-[72px]">
        <button
          onClick={() => navigateToPage('startlist')}
          className={cn(
            "flex flex-col items-center justify-center flex-1 transition-all gap-1 py-2",
            currentPage === 'startlist'
              ? "text-primary bg-primary/10"
              : "text-muted-foreground active:bg-muted"
          )}
        >
          <Plane className="h-7 w-7" />
          <span className="text-sm font-semibold">Startliste</span>
        </button>

        {schoolEnabled && (
          <button
            onClick={() => navigateToPage('school')}
            className={cn(
              "flex flex-col items-center justify-center flex-1 transition-all gap-1 py-2",
              currentPage === 'school'
                ? "text-primary bg-primary/10"
                : "text-muted-foreground active:bg-muted"
            )}
          >
            <GraduationCap className="h-7 w-7" />
            <span className="text-sm font-semibold">Skoling</span>
          </button>
        )}

        <button
          onClick={() => navigateToPage('statistics')}
          className={cn(
            "flex flex-col items-center justify-center flex-1 transition-all gap-1 py-2",
            currentPage === 'statistics'
              ? "text-primary bg-primary/10"
              : "text-muted-foreground active:bg-muted"
          )}
        >
          <BarChart2 className="h-7 w-7" />
          <span className="text-sm font-semibold">Statistik</span>
        </button>

        <button
          onClick={() => navigateToPage('settings')}
          className={cn(
            "flex flex-col items-center justify-center flex-1 transition-all gap-1 py-2",
            currentPage === 'settings'
              ? "text-primary bg-primary/10"
              : "text-muted-foreground active:bg-muted"
          )}
        >
          <SettingsIcon className="h-7 w-7" />
          <span className="text-sm font-semibold">Indstillinger</span>
        </button>
      </div>
    </div>
  );
}

interface HeaderInfoProps {
  wsConnected: boolean;
  isAuthenticatedOnWs: boolean;
  pingStatus?: 'pending' | 'success' | 'failed';
  dailyInfo?: any;
  tcasAlert?: TcasAlertData | null;
  isLivemap?: boolean;
}

// Define interface for TCAS alert data
interface TcasAlertData {
  type: 'landing_incursion' | 'clear_incursion';
  airfield: string;
  aircraft: Array<{
    flarm_id: string;
    registration: string;
  }>;
  severity?: 'low' | 'medium' | 'high';
  timestamp?: string;
}

export function StartlisteHeader({ 
  wsConnected, 
  isAuthenticatedOnWs, 
  pingStatus = 'pending', 
  dailyInfo,
  tcasAlert,
  isLivemap = false
}: HeaderInfoProps) {
  const [time, setTime] = useState<string>("")
  const [date, setDate] = useState<string>("")
  const [trafficLeader, setTrafficLeader] = useState<string>("Ej valgt")
  const [gameLeader, setGameLeader] = useState<string>("Ej valgt")
  const [schoolEnabled, setSchoolEnabled] = useState<boolean>(false)
  const [changeAirfieldDialogOpen, setChangeAirfieldDialogOpen] = useState(false)
  const isMobile = useIsMobile()

  // Get context for navigation
  const {
    currentPage,
    navigateToPage,
    addFlightDialogOpen,
    setAddFlightDialogOpen,
    handleAddFlight,
    airfieldOptions,
    socketRef,
    currentAirfield
  } = useStartliste()

  // Load school setting from localStorage
  useEffect(() => {
    const loadSchoolSetting = () => {
      const storedSchoolEnabled = localStorage.getItem("schoolEnabled")
      if (storedSchoolEnabled !== null) {
        setSchoolEnabled(storedSchoolEnabled === "true")
      } else {
        // Default to false (disabled)
        localStorage.setItem("schoolEnabled", "false")
        setSchoolEnabled(false)
      }
    }

    loadSchoolSetting()

    // Listen for changes to school setting
    const handleSchoolEnabledChange = () => {
      loadSchoolSetting()
    }

    window.addEventListener("schoolEnabledChanged", handleSchoolEnabledChange)

    return () => {
      window.removeEventListener("schoolEnabledChanged", handleSchoolEnabledChange)
    }
  }, [])

  // Helper function to get connection status
  const getConnectionStatus = () => {
    if (!wsConnected) {
      return { text: 'Afbrudt', icon: WifiOff, classes: 'bg-red-100 text-red-800 border-red-300' };
    }
    // wsConnected is true here
    if (!isAuthenticatedOnWs) {
      // You can customize this state, e.g., "Authenticating..." or keep it as "Afbrudt" until fully auth'd
      return { text: 'Godkender...', icon: WifiOff, classes: 'bg-yellow-100 text-yellow-800 border-yellow-300' }; 
    }
    // wsConnected and isAuthenticatedOnWs are true
    return { text: 'Forbundet', icon: Wifi, classes: 'bg-green-100 text-green-800 border-green-300' };
  };

  // Helper function to format aircraft registrations for TCAS alert
  const formatAircraftRegistrations = (aircraft: Array<{registration: string}>) => {
    if (!aircraft || aircraft.length === 0) return "";
    
    return aircraft.map(ac => ac.registration).join(' og ');
  };

  // Set trafficLeader from dailyInfo if available
  useEffect(() => {
    if (dailyInfo?.trafficLeader) {
      const fullName = `${dailyInfo.trafficLeader.firstname} ${dailyInfo.trafficLeader.lastname}`;
      setTrafficLeader(fullName);
    } else if (dailyInfo) {
      // Check if club is operating from a different airfield than their home field
      const isOperatingFromDifferentAirfield = currentAirfield && dailyInfo.club?.homefield && 
                                             currentAirfield !== dailyInfo.club.homefield;
      
      // If operating from different airfield, roles are optional - show "Ikke påkrævet"
      // If operating from home airfield, roles are required - show "Ej valgt"
      setTrafficLeader(isOperatingFromDifferentAirfield ? "Ikke påkrævet" : "Ej valgt");
    }
  }, [dailyInfo, currentAirfield]);

  // Set towPerson from dailyInfo if available
  useEffect(() => {
    if (dailyInfo?.towPerson) {
      const fullName = `${dailyInfo.towPerson.firstname} ${dailyInfo.towPerson.lastname}`;
      setGameLeader(fullName);
    } else if (dailyInfo) {
      // Check if club is operating from a different airfield than their home field
      const isOperatingFromDifferentAirfield = currentAirfield && dailyInfo.club?.homefield && 
                                             currentAirfield !== dailyInfo.club.homefield;
      
      // If operating from different airfield, roles are optional - show "Ikke påkrævet"
      // If operating from home airfield, roles are required - show "Ej valgt"
      setGameLeader(isOperatingFromDifferentAirfield ? "Ikke påkrævet" : "Ej valgt");
    }
  }, [dailyInfo, currentAirfield]);

  // Update clock and date
  useEffect(() => {
    const updateClock = () => {
      const now = new Date()
      const timeString = now.toLocaleTimeString("da-DK", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })

      const dateString = now.toLocaleDateString("da-DK", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      })

      setTime(timeString)
      setDate(dateString)
    }

    updateClock()
    const interval = setInterval(updateClock, 1000)

    return () => clearInterval(interval)
  }, [])

  // Handle "+" button click - navigate to startlist and open dialog
  const handleAddFlightClick = () => {
    if (currentPage !== 'startlist') {
      navigateToPage('startlist');
      // Small delay to ensure navigation completes before opening dialog
      setTimeout(() => setAddFlightDialogOpen(true), 100);
    } else {
      setAddFlightDialogOpen(true);
    }
  };

  // Render minimal header for mobile livemap - just back button, no bottom nav
  if (isLivemap && isMobile) {
    return (
      <div className="fixed top-0 left-0 right-0 z-40 bg-background/95 backdrop-blur-sm shadow-sm">
        <div className="flex items-center justify-between px-3 py-2 bg-slate-100">
          <button
            onClick={() => navigateToPage('startlist')}
            className="flex items-center gap-2 px-3 py-2 bg-primary text-primary-foreground rounded-lg font-medium text-sm"
          >
            <ArrowLeft className="h-4 w-4" />
            Tilbage til startliste
          </button>

          <div className="flex items-center gap-2">
            {(() => {
              const status = getConnectionStatus();
              const StatusIcon = status.icon;
              return (
                <Badge
                  variant="outline"
                  className={`${status.classes} flex items-center gap-1 px-2 py-0.5`}
                >
                  <StatusIcon className="h-3.5 w-3.5" />
                  <span className="text-xs">{status.text}</span>
                </Badge>
              );
            })()}
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
    <div className="fixed top-0 left-0 right-0 z-40 bg-background/95 backdrop-blur-sm shadow-md">
      {/* Header Info Section */}
      <div 
        className="header-info flex flex-col sm:flex-row sm:justify-between items-start sm:items-center gap-1.5 sm:gap-0 px-3 sm:px-4 py-2 sm:py-3 bg-slate-100 sm:h-[70px] relative"
      >
        {/* Center badges container - absolute positioning for perfect centering */}
        <div className="hidden sm:flex absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2 z-10 gap-2">
          {/* Current club and airfield badge - clickable */}
          {currentAirfield && (
            <Badge 
              className="bg-blue-100 hover:bg-blue-200 text-blue-800 border border-blue-300 px-3 py-1.5 text-sm font-medium whitespace-nowrap cursor-pointer transition-colors"
              onClick={() => setChangeAirfieldDialogOpen(true)}
            >
              {dailyInfo?.club?.name ? `${dailyInfo.club.name} - ${currentAirfield}` : currentAirfield}
            </Badge>
          )}
          
          {/* Traffic alert badge */}
          {tcasAlert && tcasAlert.type === 'landing_incursion' && (
            <Badge 
              className={`
                bg-orange-100 hover:bg-orange-100 text-orange-800 border border-orange-300 
                px-3 py-1.5 text-sm font-medium whitespace-nowrap
                ${tcasAlert.severity === 'high' ? 'animate-pulse bg-red-100 text-red-800 border-red-300' : ''}
              `}
            >
              Trafik! {formatAircraftRegistrations(tcasAlert.aircraft)}
            </Badge>
          )}
        </div>
        
        <div className="flex flex-col">
          <div className="flex items-center gap-1 sm:gap-2">
            <div className="hidden sm:flex items-center min-w-[120px]">
              <ClockIcon className="h-5 w-5 mr-2" />
              <span className="text-lg font-medium">{time}</span>
            </div>

            {/* Connection status badge - shows detailed connection status */}
            {(() => {
              const status = getConnectionStatus();
              const StatusIcon = status.icon;
              
              return (
                <Badge
                  variant="outline"
                  className={`${status.classes} flex items-center gap-1 px-2 py-0.5 text-sm`}
                >
                  <StatusIcon className="h-3.5 w-3.5" />
                  <span>{status.text}</span>
                </Badge>
              );
            })()}
            
            {/* Mobile view for airfield badge - clickable */}
            {currentAirfield && (
              <Badge 
                className="sm:hidden bg-blue-100 hover:bg-blue-200 text-blue-800 border border-blue-300 px-2.5 py-0.5 text-sm font-medium cursor-pointer transition-colors"
                onClick={() => setChangeAirfieldDialogOpen(true)}
              >
                {dailyInfo?.club?.name ? `${dailyInfo.club.name} - ${currentAirfield}` : currentAirfield}
              </Badge>
            )}
            
            {/* Mobile view for TCAS alert */}
            {tcasAlert && tcasAlert.type === 'landing_incursion' && (
              <Badge
                className={`
                  sm:hidden bg-orange-100 hover:bg-orange-100 text-orange-800 border border-orange-300
                  px-2 py-0.5 text-xs font-medium
                  ${tcasAlert.severity === 'high' ? 'animate-pulse bg-red-100 text-red-800 border-red-300' : ''}
                `}
              >
                Trafik! {formatAircraftRegistrations(tcasAlert.aircraft)}
              </Badge>
            )}

            {/* Mobile Livekort badge */}
            <Badge
              onClick={() => navigateToPage('livemap')}
              className={cn(
                "sm:hidden flex items-center gap-1 px-2.5 py-0.5 text-sm font-medium cursor-pointer transition-colors",
                currentPage === 'livemap'
                  ? "bg-primary text-primary-foreground border-primary hover:bg-primary/90"
                  : "bg-purple-100 hover:bg-purple-200 text-purple-800 border border-purple-300"
              )}
            >
              <MapPin className="h-3.5 w-3.5" />
              Livekort
            </Badge>
          </div>
          <div className="hidden sm:flex items-center gap-1 text-sm text-muted-foreground mt-0.5">
            <User className="h-4 w-4" />
            <span>Trafikleder: {trafficLeader}</span>
          </div>
        </div>

        <div className="hidden sm:flex flex-col items-start sm:items-end">
          <div className="flex items-center gap-2">
            <div className="text-base font-medium">{date}</div>
          </div>
          <div className="flex items-center gap-1 text-sm text-muted-foreground mt-0.5">
            <User className="h-4 w-4" />
            <span>Spilfører: {gameLeader}</span>
          </div>
        </div>
      </div>

      {/* Navigation Tabs - Desktop only */}
      <div className="hidden sm:flex w-full h-16 rounded-none bg-background">
        <button
          onClick={() => navigateToPage('startlist')}
          className={`text-lg py-4 flex-1 rounded-none flex items-center justify-center gap-2 transition-colors font-semibold
            ${currentPage === 'startlist'
              ? 'bg-primary/10 text-primary'
              : 'hover:bg-muted/50 text-gray-600'}`}
        >
          <Plane className="h-5 w-5" />
          Startliste
        </button>
        <button
          onClick={() => navigateToPage('livemap')}
          className={`hidden md:flex text-lg py-4 flex-1 rounded-none items-center justify-center gap-2 transition-colors font-semibold
            ${currentPage === 'livemap'
              ? 'bg-primary/10 text-primary'
              : 'hover:bg-muted/50 text-gray-600'}`}
        >
          <MapPin className="h-5 w-5" />
          Livekort
        </button>
        {schoolEnabled && (
          <button
            onClick={() => navigateToPage('school')}
            className={`text-lg py-4 flex-1 rounded-none flex items-center justify-center gap-2 transition-colors font-semibold
              ${currentPage === 'school'
                ? 'bg-primary/10 text-primary'
                : 'hover:bg-muted/50 text-gray-600'}`}
          >
            <GraduationCap className="h-5 w-5" />
            Skoling
          </button>
        )}
        <button
          onClick={() => navigateToPage('statistics')}
          className={`text-lg py-4 flex-1 rounded-none flex items-center justify-center gap-2 transition-colors font-semibold
            ${currentPage === 'statistics'
              ? 'bg-primary/10 text-primary'
              : 'hover:bg-muted/50 text-gray-600'}`}
        >
          <BarChart2 className="h-5 w-5" />
          Statistik
        </button>
        <button
          onClick={() => navigateToPage('settings')}
          className={`text-lg py-4 flex-1 rounded-none flex items-center justify-center gap-2 transition-colors font-semibold
            ${currentPage === 'settings'
              ? 'bg-primary/10 text-primary'
              : 'hover:bg-muted/50 text-gray-600'}`}
        >
          <SettingsIcon className="h-5 w-5" />
          Indstillinger
        </button>
      </div>
      
      {/* Add Flight Button - only shown on startlist page, desktop only */}
      {currentPage === "startlist" && (
        <div className="hidden sm:block px-2 py-2 bg-background/95 backdrop-blur-sm border-t border-b shadow-sm">
          <AddFlightDialog
            open={addFlightDialogOpen}
            onOpenChange={setAddFlightDialogOpen}
            onAddFlight={handleAddFlight}
            airfieldOptions={airfieldOptions}
            socket={socketRef.current}
          />
        </div>
      )}
      
      {/* Table headers - only visible on desktop and startlist page */}
      {currentPage === "startlist" && (
        <div className="hidden md:block px-2 md:px-3 py-1 bg-background/95 backdrop-blur-sm">
          <div className="grid grid-cols-[50px_1.5fr_2fr_0.8fr_0.8fr_0.8fr_150px] gap-2 py-1 rounded-md px-3">
            <div className="text-base font-medium">#</div>
            <div className="text-base font-medium">Fly</div>
            <div className="text-base font-medium">Pilot</div>
            <div className="text-base font-medium">Start</div>
            <div className="text-base font-medium">Slut</div>
            <div className="text-base font-medium">Varighed</div>
            <div className="text-base font-medium text-right">Status/Handling</div>
          </div>
        </div>
      )}

      {/* Change Airfield Dialog */}
      <ChangeAirfieldDialog
        open={changeAirfieldDialogOpen}
        onOpenChange={setChangeAirfieldDialogOpen}
        currentAirfield={currentAirfield}
      />
    </div>

    {/* Mobile Bottom Navigation */}
    <MobileBottomNav
      currentPage={currentPage}
      navigateToPage={navigateToPage}
      schoolEnabled={schoolEnabled}
    />

    {/* Mobile Floating Add Button - only on startlist page */}
    {currentPage === 'startlist' && (
      <div className="sm:hidden fixed bottom-[76px] right-4 z-50">
        <button
          onClick={() => setAddFlightDialogOpen(true)}
          className="w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center hover:bg-primary/90 active:scale-95 transition-all"
          aria-label="Tilføj flyvning"
        >
          <Plus className="h-7 w-7" strokeWidth={2.5} />
        </button>
      </div>
    )}

    {/* Hidden AddFlightDialog for mobile */}
    <div className="sm:hidden">
      <AddFlightDialog
        open={addFlightDialogOpen}
        onOpenChange={setAddFlightDialogOpen}
        onAddFlight={handleAddFlight}
        airfieldOptions={airfieldOptions}
        socket={socketRef.current}
        hideTrigger={true}
      />
    </div>
  </>
  )
}