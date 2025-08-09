"use client"

import { Card } from "@/components/ui/card"
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip"
import { GraduationCap, Users, RotateCw, Timer, Compass, Gauge, ArrowUp, ArrowDown, Minus, Clock } from "lucide-react"
import Image from "next/image"
import type { LiveAircraft } from "@/types/live-map"
import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { useAircraft } from "@/contexts/aircraft-context"

interface AircraftCardProps {
  aircraft: LiveAircraft
  isSelected: boolean
  onSelect: (aircraft: LiveAircraft) => void
  getFlyingTime: (startTime: Date) => string
  isClubPlane: boolean
}

export function AircraftCard({ aircraft, isSelected, onSelect, getFlyingTime, isClubPlane }: AircraftCardProps) {
  // State to store formatted last seen time, which will be refreshed periodically
  const [lastSeenFormatted, setLastSeenFormatted] = useState<string>('N/A');
  const { openFlightReplay, flightTrack } = useAircraft();

  // Format the altitude to show only meters with thousand separators
  const formatAltitude = (meters: number) => {
    return `${meters.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, '.')} m`;
  };
  
  // Format the speed for display in km/h
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
  
  // Format the climb rate for display
  const formatClimbRate = (climbRate?: number) => {
    if (climbRate === undefined) return 'N/A';
    const sign = climbRate > 0 ? '+' : '';
    return `${sign}${climbRate.toFixed(1)} m/s`;
  };

  // Get climb rate icon and color
  const getClimbRateIcon = (climbRate?: number) => {
    if (climbRate === undefined) return <Minus className="h-4 w-4 text-gray-400" />;
    if (climbRate > 0.2) return <ArrowUp className="h-4 w-4 text-green-500" />;
    if (climbRate < -0.2) return <ArrowDown className="h-4 w-4 text-red-500" />;
    return <Minus className="h-4 w-4 text-gray-400" />;
  };

  // Format turn rate
  const formatTurnRate = (turnRate?: number) => {
    if (turnRate === undefined) return 'N/A';
    const sign = turnRate > 0 ? '+' : '';
    return `${sign}${turnRate.toFixed(1)}°/s`;
  };

  // Format variometer average with individual values
  const formatVariometerValue = (value?: number | null, label: string) => {
    if (value === null || value === undefined) {
      return { text: '--', color: 'text-gray-400' };
    }
    const sign = value >= 0 ? '+' : '';
    const text = `${sign}${value.toFixed(1)}`;
    const color = value > 0.2 ? 'text-green-600' : value < -0.2 ? 'text-red-600' : 'text-gray-600';
    return { text, color };
  };
  
  // Format the track (heading)
  const formatTrack = (track?: number) => {
    if (track === undefined) return 'N/A';
    return `${track.toFixed(0)}°`;
  };
  
  // Format the last seen time
  const formatLastSeen = (dateTime?: Date | string) => {
    if (!dateTime) return 'N/A';
    
    try {
      // Ensure we have a Date object
      const dateObj = typeof dateTime === 'string' ? new Date(dateTime) : dateTime;
      
      // Force format time in Danish timezone (CET/CEST)
      const options: Intl.DateTimeFormatOptions = { 
        hour: '2-digit', 
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
        timeZone: 'Europe/Copenhagen' // Explicitly set to Danish timezone
      };
      
      // Format the time string with Danish locale and timezone
      const formatter = new Intl.DateTimeFormat('da-DK', options);
      const timeStr = formatter.format(dateObj);
      
      // Calculate seconds/minutes since
      const now = new Date();
      const diffMs = now.getTime() - dateObj.getTime();
      const diffSec = Math.floor(diffMs / 1000);
      
      // Handle negative time differences (when lastSeen is in the future due to clock sync issues)
      // or very recent timestamps (less than 3 seconds)
      if (diffSec < 3) {
        return `${timeStr} (nu)`; // Show "now" for future timestamps and very recent ones
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

  // Effect to refresh the "last seen" time every second
  useEffect(() => {
    // Initial format
    setLastSeenFormatted(formatLastSeen(aircraft.lastSeen));
    
    // Set up interval to update the time
    const interval = setInterval(() => {
      setLastSeenFormatted(formatLastSeen(aircraft.lastSeen));
    }, 1000);
    
    // Clean up interval on unmount or when aircraft changes
    return () => clearInterval(interval);
  }, [aircraft.lastSeen]);
  
  return (
    <TooltipProvider>
      <Card
        key={aircraft.id}
        className={`p-4 cursor-pointer hover:bg-accent/50 active:bg-accent/70 transition-colors ${
          isSelected ? "border-primary bg-primary/5 border-2" : isClubPlane ? "border-primary/30 bg-primary/5" : ""
        }`}
        onClick={(e) => {
          e.stopPropagation();
          onSelect(aircraft);
        }}
      >
        <div className="flex items-center gap-3 mb-2">
          <div className={`p-2 rounded-full ${isClubPlane ? 'bg-primary/15' : 'bg-gray-100'}`}>
            <div
              className="h-6 w-6 text-gray-700"
              style={{
                transform: `rotate(${aircraft.track !== undefined ? aircraft.track : aircraft.heading}deg)`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {/* Use the same aircraft type detection as the map */}
              {aircraft.aircraftType === "Glider" ? (
                <img 
                  src="/images/aircrafts/glider.png" 
                  alt="Glider" 
                  width={24} 
                  height={24} 
                  className={isClubPlane ? 'brightness-110' : ''}
                />
              ) : (["Tow Plane", "Drop Plane", "Powered Aircraft"].includes(aircraft.aircraftType || "") || 
                     !aircraft.aircraftType || 
                     aircraft.aircraftType === "Unknown" || 
                     aircraft.aircraftType === "") ? (
                <img 
                  src="/images/aircrafts/singleprop.png" 
                  alt="Powered Aircraft" 
                  width={24} 
                  height={24} 
                  className={isClubPlane ? 'brightness-110' : ''}
                />
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill={isClubPlane ? '#2563eb' : 'currentColor'} stroke="none">
                  <path d="M21,16V14L13,9V3.5A1.5,1.5 0 0,0 11.5,2A1.5,1.5 0 0,0 10,3.5V9L2,14V16L10,13.5V19L8,20.5V22L11.5,21L15,22V20.5L13,19V13.5L21,16Z" />
                </svg>
              )}
            </div>
          </div>
          <div className="flex-1">
            <div className="flex items-center">
              <h4 className="font-bold text-xl">{aircraft.registration}</h4>
              {isClubPlane && (
                <span className="ml-3 px-2 py-1 text-sm font-medium bg-primary/15 text-primary rounded-md">
                  Klubfly
                </span>
              )}
              {aircraft.isSchoolFlight && <GraduationCap className="h-5 w-5 text-blue-600 ml-2" />}
            </div>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-base text-gray-600 bg-gray-100 px-2 py-1 rounded">{aircraft.type}</span>
              {aircraft.source === 'adsb' && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="bg-blue-50 border border-blue-200 rounded flex items-center justify-center h-6 px-2">
                      <span className="text-blue-700 font-semibold text-xs">ADSB</span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>ADS-B Automatic Dependent Surveillance</p>
                  </TooltipContent>
                </Tooltip>
              )}
              {(aircraft.hasFlarm || aircraft.source === 'flarm' || aircraft.source === 'ogn') && aircraft.source !== 'adsb' && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="bg-white rounded border border-gray-200 flex items-center justify-center h-6 px-2">
                      <Image src="/images/flarm-logo.png" alt="FLARM" width={40} height={14} className="h-4 w-auto" />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>FLARM Collision Avoidance System</p>
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
          </div>
        </div>

        {(aircraft.pilot !== "Unknown" || aircraft.coPilot) && (
          <div className="flex items-center gap-2 mb-2 text-base">
            <Users className="h-5 w-5 text-gray-500" />
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

        <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-base">
          <div className="flex items-center gap-2">
            <Compass className="h-4 w-4 text-blue-500" />
            <div>
              <div className="text-xs text-gray-500">Kurs</div>
              <div className="font-semibold">{formatTrack(aircraft.heading)}</div>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <ArrowUp className="h-4 w-4 text-blue-500" />
            <div className="flex-1">
              <div className="text-xs text-gray-500 mb-1">Variometer</div>
              <div className="flex gap-3">
                <div className="flex flex-col items-center">
                  <div className="text-xs text-gray-400">30s</div>
                  <div className={`font-bold text-sm ${formatVariometerValue(aircraft.climb_rate_30s_avg, '30s').color}`}>
                    {formatVariometerValue(aircraft.climb_rate_30s_avg, '30s').text}
                  </div>
                </div>
                <div className="flex flex-col items-center">
                  <div className="text-xs text-gray-400">60s</div>
                  <div className={`font-bold text-sm ${formatVariometerValue(aircraft.climb_rate_60s_avg, '60s').color}`}>
                    {formatVariometerValue(aircraft.climb_rate_60s_avg, '60s').text}
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <ArrowUp className="h-4 w-4 text-purple-500" />
            <div>
              <div className="text-xs text-gray-500">Højde</div>
              <div className="font-semibold">{formatAltitude(aircraft.altitude)}</div>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Gauge className="h-4 w-4 text-green-500" />
            <div>
              <div className="text-xs text-gray-500">Hastighed</div>
              <div className="font-semibold">{formatSpeed(aircraft.speed, aircraft.source)}</div>
            </div>
          </div>
          
          {aircraft.climbRate !== undefined && (
            <div className="flex items-center gap-2">
              {getClimbRateIcon(aircraft.climbRate)}
              <div>
                <div className="text-xs text-gray-500">Stigehastighed</div>
                <div className="font-semibold">{formatClimbRate(aircraft.climbRate)}</div>
              </div>
            </div>
          )}
          
          {aircraft.lastSeen && (
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-gray-500" />
              <div>
                <div className="text-xs text-gray-500">Sidst set</div>
                <div className="font-semibold text-sm">{lastSeenFormatted}</div>
              </div>
            </div>
          )}
        </div>
        
        {/* Add replay button if this aircraft is selected */}
        {isSelected && flightTrack && flightTrack.data && flightTrack.data.length > 1 && (
          <div className="mt-4 pt-3 border-t">
            <Button
              variant="outline"
              size="lg"
              className="w-full h-12 text-base"
              onClick={(e) => {
                e.stopPropagation(); // Prevent triggering card click
                openFlightReplay(aircraft.registration);
              }}
            >
              <Timer className="h-5 w-5 mr-2" />
              Afspil flyvning
            </Button>
          </div>
        )}
      </Card>
    </TooltipProvider>
  )
}

