"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { X, Compass, Gauge, ArrowUp, ArrowDown, Minus, Clock, Users, GraduationCap, RotateCw, ChevronDown, Zap } from "lucide-react"
import type { LiveAircraft } from "@/types/live-map"
import { useAircraft } from "@/contexts/aircraft-context"
import { useIsMobile } from "@/hooks/use-mobile"
import Image from "next/image"

export function MobileAircraftDrawer() {
  const { selectedAircraft, setSelectedAircraft, isClubPlane } = useAircraft()
  const isMobile = useIsMobile()
  const [lastSeenFormatted, setLastSeenFormatted] = useState<string>('N/A');
  const [isExpanded, setIsExpanded] = useState(false)

  const isOpen = !!selectedAircraft && isMobile
  const aircraft = selectedAircraft

  // Format functions (same as aircraft card)
  const formatAltitude = (meters: number) => {
    return `${meters.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, '.')} m`;
  };
  
  const formatSpeed = (speed: number, source?: string) => {
    let kmh: number;
    
    // For ADSB aircraft, speed is already in km/h from websocket processing
    // For OGN/FLARM aircraft, speed is in knots and needs conversion
    if (source === 'adsb') {
      kmh = speed; // Already in km/h
    } else {
      kmh = speed * 1.852; // Convert knots to km/h
    }
    
    return `${kmh.toFixed(0)} km/h`;
  };
  
  const formatClimbRate = (climbRate?: number) => {
    if (climbRate === undefined) return 'N/A';
    const sign = climbRate > 0 ? '+' : '';
    return `${sign}${climbRate.toFixed(1)} m/s`;
  };

  const getClimbRateIcon = (climbRate?: number) => {
    if (climbRate === undefined) return <Minus className="h-4 w-4 text-gray-400" />;
    if (climbRate > 0.2) return <ArrowUp className="h-4 w-4 text-green-500" />;
    if (climbRate < -0.2) return <ArrowDown className="h-4 w-4 text-red-500" />;
    return <Minus className="h-4 w-4 text-gray-400" />;
  };

  const formatTurnRate = (turnRate?: number) => {
    if (turnRate === undefined) return 'N/A';
    const sign = turnRate > 0 ? '+' : '';
    return `${sign}${turnRate.toFixed(1)}°/s`;
  };
  
  const formatTrack = (track?: number) => {
    if (track === undefined) return 'N/A';
    return `${track.toFixed(0)}°`;
  };
  
  const formatLastSeen = (dateTime?: Date | string) => {
    if (!dateTime) return 'N/A';
    
    try {
      const dateObj = typeof dateTime === 'string' ? new Date(dateTime) : dateTime;
      
      const options: Intl.DateTimeFormatOptions = { 
        hour: '2-digit', 
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
        timeZone: 'Europe/Copenhagen'
      };
      
      const formatter = new Intl.DateTimeFormat('da-DK', options);
      const timeStr = formatter.format(dateObj);
      
      const now = new Date();
      const diffMs = now.getTime() - dateObj.getTime();
      const diffSec = Math.floor(diffMs / 1000);
      
      // Handle negative time differences (when lastSeen is in the future due to clock sync issues)
      if (diffSec < 0) {
        return `${timeStr} (nu)`; // Show "now" for future timestamps
      } else if (diffSec < 60) {
        return `${timeStr} (${diffSec} sek.)`;
      } else {
        const diffMin = Math.floor(diffSec / 60);
        return `${timeStr} (${diffMin} min.)`;
      }
    } catch (error) {
      console.error('Error formatting last seen time:', error);
      return 'Tidsfejl';
    }
  };

  // Update last seen time
  useEffect(() => {
    if (!aircraft) return;
    
    setLastSeenFormatted(formatLastSeen(aircraft.lastSeen));
    
    const interval = setInterval(() => {
      setLastSeenFormatted(formatLastSeen(aircraft.lastSeen));
    }, 1000);
    
    return () => clearInterval(interval);
  }, [aircraft?.lastSeen]);

  // Reset expanded state when aircraft changes
  useEffect(() => {
    if (aircraft) {
      setIsExpanded(true)
    }
  }, [aircraft?.id])

  const handleClose = () => {
    setSelectedAircraft(null)
    setIsExpanded(false)
  }

  // Only show on mobile - but call all hooks first
  if (!isMobile) return null

  if (!aircraft) return null

  const isClub = isClubPlane(aircraft.registration)

  return (
    <div 
      className={`fixed bottom-0 left-0 right-0 z-[9999] transition-transform duration-300 ease-in-out transform ${
        isOpen ? 'translate-y-0' : 'translate-y-full'
      }`}
    >
      {/* FlightRadar-style bottom panel */}
      <div className="bg-white/95 backdrop-blur-sm border-t shadow-lg">
        {/* Compact header - always visible */}
        <div 
          className="flex items-center justify-between p-3 cursor-pointer"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <div className="flex items-center gap-3 flex-1">
            <div className={`p-1.5 rounded-full ${isClub ? 'bg-primary/15' : 'bg-gray-100'}`}>
              <div
                className="h-5 w-5 text-gray-700"
                style={{
                  transform: `rotate(${aircraft.track !== undefined ? aircraft.track : aircraft.heading}deg)`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {aircraft.aircraftType === "Glider" ? (
                  <img 
                    src="/images/aircrafts/glider.png" 
                    alt="Glider" 
                    width={20} 
                    height={20} 
                    className={isClub ? 'brightness-110' : ''}
                  />
                ) : (["Tow Plane", "Drop Plane", "Powered Aircraft"].includes(aircraft.aircraftType || "") || 
                       !aircraft.aircraftType || 
                       aircraft.aircraftType === "Unknown" || 
                       aircraft.aircraftType === "") ? (
                  <img 
                    src="/images/aircrafts/singleprop.png" 
                    alt="Powered Aircraft" 
                    width={20} 
                    height={20} 
                    className={isClub ? 'brightness-110' : ''}
                  />
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20" fill={isClub ? '#2563eb' : 'currentColor'} stroke="none">
                    <path d="M21,16V14L13,9V3.5A1.5,1.5 0 0,0 11.5,2A1.5,1.5 0 0,0 10,3.5V9L2,14V16L10,13.5V19L8,20.5V22L11.5,21L15,22V20.5L13,19V13.5L21,16Z" />
                  </svg>
                )}
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-lg">{aircraft.registration}</h3>
                {isClub && (
                  <span className="px-1.5 py-0.5 text-xs font-medium bg-primary/15 text-primary rounded">
                    Klubfly
                  </span>
                )}
                {aircraft.isSchoolFlight && <GraduationCap className="h-4 w-4 text-blue-600" />}
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation()
                setIsExpanded(!isExpanded)
              }}
            >
              <ChevronDown className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
            </Button>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={(e) => {
                e.stopPropagation()
                handleClose()
              }}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Expanded details */}
        {isExpanded && (
          <div className="px-3 pb-3 space-y-3 border-t bg-white/80">
            {(aircraft.pilot !== "Unknown" || aircraft.coPilot) && (
              <div className="flex items-center gap-2 text-sm pt-3">
                <Users className="h-4 w-4 text-gray-500" />
                <div>
                  {aircraft.pilot !== "Unknown" && (
                    <span className="font-medium">{aircraft.pilot}</span>
                  )}
                  {aircraft.coPilot && aircraft.coPilot !== "Unknown" && (
                    <span className="text-gray-500">
                      {aircraft.pilot !== "Unknown" ? " & " : ""}{aircraft.coPilot}
                    </span>
                  )}
                </div>
              </div>
            )}

            <div className="grid grid-cols-4 gap-1.5 text-sm mb-2">
              <div className="flex flex-col items-center gap-1 p-1.5 bg-gray-50 rounded-lg">
                <Gauge className="h-3 w-3 text-blue-500" />
                <div className="text-center">
                  <div className="text-xs text-gray-500">Højde</div>
                  <div className="font-semibold text-xs">{formatAltitude(aircraft.altitude)}</div>
                </div>
              </div>
              
              <div className="flex flex-col items-center gap-1 p-1.5 bg-gray-50 rounded-lg">
                <Zap className="h-3 w-3 text-green-500" />
                <div className="text-center">
                  <div className="text-xs text-gray-500">Hastighed</div>
                  <div className="font-semibold text-xs">{formatSpeed(aircraft.speed, aircraft.source)}</div>
                </div>
              </div>
              
              <div className="flex flex-col items-center gap-1 p-1.5 bg-gray-50 rounded-lg">
                <Compass className="h-3 w-3 text-purple-500" />
                <div className="text-center">
                  <div className="text-xs text-gray-500">Kurs</div>
                  <div className="font-semibold text-xs">{formatTrack(aircraft.heading)}</div>
                </div>
              </div>
              
              <div className="flex flex-col items-center gap-1 p-1.5 bg-gray-50 rounded-lg">
                <RotateCw className={`h-3 w-3 ${
                  aircraft.turnRate !== undefined && Math.abs(aircraft.turnRate) > 0.5 
                    ? Math.abs(aircraft.turnRate) > 3 ? 'text-orange-500' : 'text-blue-500'
                    : 'text-gray-400'
                } ${aircraft.turnRate !== undefined && aircraft.turnRate < 0 ? 'transform rotate-180' : ''}`} />
                <div className="text-center">
                  <div className="text-xs text-gray-500">Drej</div>
                  <div className="font-semibold text-xs">{formatTurnRate(aircraft.turnRate)}</div>
                </div>
              </div>
            </div>
            
            {/* Optional metrics in a separate row */}
            <div className="grid grid-cols-2 gap-2 text-sm">
              {aircraft.climbRate !== undefined && (
                <div className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg">
                  {getClimbRateIcon(aircraft.climbRate)}
                  <div>
                    <div className="text-xs text-gray-500">Stigehastighed</div>
                    <div className="font-semibold">{formatClimbRate(aircraft.climbRate)}</div>
                  </div>
                </div>
              )}
              
              {aircraft.lastSeen && (
                <div className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg">
                  <Clock className="h-4 w-4 text-gray-500" />
                  <div>
                    <div className="text-xs text-gray-500">Sidst set</div>
                    <div className="font-semibold text-xs">{lastSeenFormatted}</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
} 