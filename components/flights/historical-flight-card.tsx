"use client"

import { Card } from "@/components/ui/card"
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip"
import { Clock, GraduationCap, Users, User, FileText, RotateCcw } from "lucide-react"
import { forwardRef, useState, useEffect } from "react"
import type { Flight } from "@/types/flight"

// Function to check if a pilot is a guest (id is exactly "guest")
const isGuestPilot = (pilot: any) => {
  if (!pilot) return false;
  return pilot.id === "guest";
};

// Helper function to check if the flight has any guest pilots
const hasGuestPilots = (flight: Flight) => {
  return (flight.pilot && isGuestPilot(flight.pilot)) || 
         (flight.coPilot && isGuestPilot(flight.coPilot));
};

interface HistoricalFlightCardProps {
  flight: Flight & { isPrivatePlane?: boolean }
  onEditClick: (flight: Flight) => void
  onTimeClick: (id: number, type: "start" | "end") => void
  getFlightDuration: (startTime: string | null, endTime: string | null) => string
  isRecentlyUpdated?: boolean
  compact?: boolean
  tableMode?: boolean
  missingPilotWarning?: boolean
  sequentialNumber?: number
  flarmStatus?: 'online' | 'offline' | 'unknown' | null
}

export const HistoricalFlightCard = forwardRef<HTMLDivElement, HistoricalFlightCardProps>(({
  flight,
  onEditClick,
  onTimeClick,
  getFlightDuration,
  isRecentlyUpdated = false,
  compact = false,
  tableMode = false,
  missingPilotWarning = false,
  sequentialNumber,
  flarmStatus = null,
}, ref) => {
  // Add animation state for visual highlighting
  const [highlight, setHighlight] = useState(false);
  
  // Effect to handle highlight animation
  useEffect(() => {
    if (isRecentlyUpdated) {
      setHighlight(true);
      const timer = setTimeout(() => {
        setHighlight(false);
      }, 4000); // Animation duration - 4 seconds
      
      return () => clearTimeout(timer);
    } else {
      // Ensure highlight is cleared when isRecentlyUpdated becomes false
      setHighlight(false);
    }
  }, [isRecentlyUpdated]);

  // Determine border styling based on highlight and missing pilot warning
  const getBorderStyle = () => {
    if (missingPilotWarning) {
      return 'border-red-500 border-2';
    }
    if (highlight) {
      return 'border-amber-500 border-2 shadow-md';
    }
    return 'border';
  };

  // Create a subtle highlight animation class
  const getHighlightClass = () => {
    if (highlight) {
      return 'bg-amber-50';
    }
    return '';
  };


  // Responsive classes for different screen sizes
  const paddingClass = compact ? "py-1.5" : "py-2";
  const textSizeClass = compact ? "text-sm" : "text-base";
  const smallTextClass = compact ? "text-xs" : "text-sm";
  const iconSizeClass = compact ? "h-3 w-3" : "h-4 w-4";
  const buttonSizeClass = compact ? "h-7 w-7" : "h-8 w-8";
  const buttonIconSizeClass = compact ? "h-3 w-3" : "h-4 w-4";
  const badgePaddingClass = compact ? "px-2 py-0.5" : "px-3 py-1";

  // Flight status-based styling classes - matching original FlightCard exactly
  const statusClasses = flight.deleted || flight.status === 'deleted'
        ? "bg-red-100 border-2 border-red-500"
        : flight.status === "pending"
          ? "bg-yellow-100 border-2 border-yellow-500"
          : flight.status === "in_flight"
            ? "bg-green-100 border-2 border-green-500"
            : "bg-blue-100 border-2 border-blue-500";

  // Rather than using if/else for the views, return both with display conditions
  // This prevents the table/card choice from breaking on some frameworks/environments
  return (
    <>
      {/* Table view - desktop only */}
      {tableMode && (
        <div 
          ref={ref}
          id={`flight-${flight.id}-table`}
          className={`hidden md:grid grid-cols-[50px_1.5fr_2fr_0.8fr_0.8fr_0.8fr_150px] gap-2 cursor-pointer items-center ${paddingClass} px-3 rounded-md ${statusClasses} ${getBorderStyle()} hover:shadow-md ${getHighlightClass()}`}
          onClick={() => onEditClick(flight)}
        >
          {/* Sequential number column */}
          <div className={`${textSizeClass} font-semibold text-center`}>
            {sequentialNumber}
          </div>
          
          {/* Aircraft column */}
          <div className="flex flex-col">
            <div className="flex items-center gap-1">
              <span className={`${textSizeClass} font-bold`}>{flight.aircraft.registration}</span>
              {flight.isSchoolFlight && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <GraduationCap className="h-5 w-5 text-blue-600" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Skoleflyning</p>
                  </TooltipContent>
                </Tooltip>
              )}
              {flight.isPrivatePlane && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <RotateCcw className="h-5 w-5 text-purple-600" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Privat fly for i dag</p>
                  </TooltipContent>
                </Tooltip>
              )}
              {hasGuestPilots(flight) && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <User className="h-5 w-5 text-blue-600" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Gæstepilot ombord</p>
                  </TooltipContent>
                </Tooltip>
              )}
              {flight.notes && flight.notes.trim() !== '' && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <FileText className="h-5 w-5 text-green-600" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Flyvning har noter</p>
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
            {/* Only show aircraft type when not in compact mode */}
            {!compact && (
              <div className="flex items-center gap-1">
                <span className="text-sm font-medium max-w-full truncate">{flight.aircraft.type}</span>
              </div>
            )}
          </div>

          {/* Pilot column */}
          <div className="flex flex-col">
            {flight.pilot ? (
              <span className={`${textSizeClass} font-bold`}>{flight.pilot.name}</span>
            ) : (
              <span className={`${textSizeClass} text-muted-foreground italic`}>Ingen pilot valgt</span>
            )}
            {flight.coPilot && (
              <span className={`${smallTextClass} font-bold text-muted-foreground`}>{flight.coPilot.name}</span>
            )}
          </div>

          {/* Start time column */}
          <div>
            <button
              className={`font-bold hover:underline focus:outline-none focus:text-primary inline-flex items-center gap-1 ${textSizeClass}`}
              onClick={(e) => {
                e.stopPropagation()
                onTimeClick(flight.id, "start")
              }}
            >
              {flight.startTime || "-"}
              <Clock className={iconSizeClass} />
            </button>
          </div>

          {/* End time column */}
          <div>
            <button
              className={`font-bold hover:underline focus:outline-none focus:text-primary inline-flex items-center gap-1 ${textSizeClass}`}
              onClick={(e) => {
                e.stopPropagation()
                onTimeClick(flight.id, "end")
              }}
            >
              {flight.endTime || "-"}
              <Clock className={iconSizeClass} />
            </button>
          </div>

          {/* Duration column */}
          <div className={`${textSizeClass} font-bold`}>
            {getFlightDuration(flight.startTime, flight.endTime)}
          </div>

          {/* Status column - Historical flights show status as badge, no action buttons */}
          <div className="flex items-center justify-end gap-2 relative">
            <div className={`${textSizeClass} font-semibold ${badgePaddingClass} min-w-[90px] whitespace-nowrap flex items-center justify-center rounded-md ${
              flight.deleted || flight.status === 'deleted'
                ? "bg-red-200 text-red-900 border border-red-500"
                : flight.status === "pending"
                  ? "bg-yellow-200 text-yellow-900 border border-yellow-500"
                  : flight.status === "in_flight"
                    ? "bg-green-200 text-green-900 border border-green-500"
                    : "bg-blue-200 text-blue-900 border border-blue-500"
            }`}>
              {flight.deleted || flight.status === 'deleted' ? "Slettet" : 
                flight.status === "pending" ? "Planlagt" : 
                flight.status === "in_flight" ? "I luften" : "Landet"}
            </div>
          </div>
        </div>
      )}
      
      {/* Card view - Mobile (regardless of tableMode) */}
      <TooltipProvider>
        <Card
          ref={tableMode ? undefined : ref} // Only use ref on card view if not in table mode
          id={`flight-${flight.id}-card`}
          className={`${tableMode ? "md:hidden" : ""} overflow-hidden md:hover:shadow-md cursor-pointer md:active:bg-accent/30 ${statusClasses} ${getBorderStyle()} ${getHighlightClass()}`}
          onClick={() => onEditClick(flight)}
        >
          <div className="p-3 space-y-2.5">
            {/* Top row: Aircraft info with badges */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <h2 className="text-xl font-bold text-gray-900">{flight.aircraft.registration}</h2>
                <div className="flex items-center gap-1">
                  {flight.isSchoolFlight && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="bg-blue-100 rounded-full p-0.5">
                          <GraduationCap className="h-3.5 w-3.5 text-blue-600" />
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Skoleflyning</p>
                      </TooltipContent>
                    </Tooltip>
                  )}
                  {flight.isPrivatePlane && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="bg-blue-100 rounded-full p-0.5">
                          <RotateCcw className="h-3.5 w-3.5 text-purple-600" />
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Privat fly for i dag</p>
                      </TooltipContent>
                    </Tooltip>
                  )}
                  {hasGuestPilots(flight) && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="bg-blue-100 rounded-full p-0.5">
                          <User className="h-3.5 w-3.5 text-blue-600" />
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Gæstepilot ombord</p>
                      </TooltipContent>
                    </Tooltip>
                  )}
                  {flight.notes && flight.notes.trim() !== '' && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="bg-green-100 rounded-full p-0.5">
                          <FileText className="h-3.5 w-3.5 text-green-600" />
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Flyvning har noter</p>
                      </TooltipContent>
                    </Tooltip>
                  )}
                </div>
              </div>
              
              {/* Duplicate button placeholder - removed for historical flights */}
            </div>

            {/* Aircraft type row */}
            <div className="text-sm text-gray-600 font-medium">
              {flight.aircraft.type}
            </div>

            {/* Pilot and Times in one row */}
            <div className="flex items-center justify-between gap-4">
              {/* Pilot section - left side, no icon */}
              <div className="flex-1 min-w-0">
                {flight.pilot ? (
                  <div>
                    <div className="text-base font-semibold text-gray-900 truncate">{flight.pilot.name}</div>
                    {flight.coPilot && (
                      <div className="text-sm text-gray-600 truncate">{flight.coPilot.name}</div>
                    )}
                  </div>
                ) : (
                  <div className="text-base text-gray-500 italic">Ingen pilot</div>
                )}
              </div>

              {/* Times section - inline layout */}
              <div className="flex items-center gap-2 text-base">
                <button
                  className="flex items-center gap-1 px-2 py-1 rounded md:hover:bg-blue-50 transition-colors"
                  onClick={(e) => {
                    e.stopPropagation()
                    onTimeClick(flight.id, "start")
                  }}
                >
                  <Clock className="h-3.5 w-3.5 text-blue-600" />
                  <span className="font-semibold">{flight.startTime || "--:--"}</span>
                </button>
                
                <span className="text-gray-400 font-medium">→</span>
                
                <button
                  className="flex items-center gap-1 px-2 py-1 rounded md:hover:bg-blue-50 transition-colors"
                  onClick={(e) => {
                    e.stopPropagation()
                    onTimeClick(flight.id, "end")
                  }}
                >
                  <Clock className="h-3.5 w-3.5 text-blue-600" />
                  <span className="font-semibold">{flight.endTime || "--:--"}</span>
                </button>
                
                {/* Duration inline */}
                {(flight.startTime || flight.endTime) && (
                  <div className="bg-blue-100 px-2 py-0.5 rounded-full ml-1">
                    <span className="text-sm font-medium text-blue-800">
                      {getFlightDuration(flight.startTime, flight.endTime)}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Status display - non-clickable for historical flights */}
            <div className={`w-full py-2.5 px-3 rounded-lg font-semibold text-base ${
              flight.deleted || flight.status === 'deleted'
                ? "bg-red-100 text-red-800 border border-red-200 opacity-60"
                : flight.status === "pending"
                  ? "bg-amber-100 text-amber-800 border border-amber-200"
                  : flight.status === "in_flight"
                    ? "bg-green-100 text-green-800 border border-green-200"
                    : "bg-blue-100 text-blue-800 border border-blue-200"
            }`}>
              {flight.deleted || flight.status === 'deleted' ? "Slettet" : 
                flight.status === "pending" ? "Planlagt" : 
                flight.status === "in_flight" ? "I luften" : "Afsluttet"}
            </div>
          </div>
        </Card>
      </TooltipProvider>
    </>
  )
})