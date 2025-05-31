"use client"

import type { LiveAircraft } from "@/types/live-map"
import { AircraftCard } from "@/components/livemap/aircraft-card"
import { Input } from "@/components/ui/input"
import { useState, useRef, useEffect } from "react"
import { useAircraft } from "@/contexts/aircraft-context"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Card } from "@/components/ui/card"
import { Search } from "lucide-react"
import { useIsMobile } from "@/hooks/use-mobile"

export function AircraftPanel() {
  const [searchQuery, setSearchQuery] = useState("")
  const { 
    aircraft, 
    selectedAircraft, 
    setSelectedAircraft, 
    connectionStatus,
    showAllPlanes,
    showOnlyFlying,
    showAdsb,
    clubPlanes,
    isClubPlane,
    isFlying
  } = useAircraft()
  const isMobile = useIsMobile()
  const aircraftListRef = useRef<HTMLDivElement>(null)
  const selectedCardRef = useRef<HTMLDivElement>(null)
  
  // Calculate flying time for aircraft card component
  const getFlyingTime = (startTime: Date): string => {
    const diffMs = Date.now() - startTime.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const hours = Math.floor(diffMins / 60)
    const mins = diffMins % 60
    return hours > 0 ? `${hours}t ${mins}m` : `${mins}m`
  }
  
  // Filter aircraft based on search query, showAllPlanes, and showOnlyFlying
  const filteredAircraft = aircraft
    .filter(ac => showAllPlanes || isClubPlane(ac.registration))
    .filter(ac => !showOnlyFlying || isFlying(ac))
    .filter(ac => 
      searchQuery.trim() === "" || 
      ac.registration.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ac.type.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ac.pilot.toLowerCase().includes(searchQuery.toLowerCase())
    )
  
  // Scroll to selected aircraft when it changes
  useEffect(() => {
    if (selectedAircraft && selectedCardRef.current && aircraftListRef.current) {
      const container = aircraftListRef.current;
      const card = selectedCardRef.current;
      container.scrollTo({
        top: card.offsetTop - container.offsetTop - 20,
        behavior: 'smooth'
      });
    }
  }, [selectedAircraft]);
  
  // Add function to handle aircraft selection
  const handleSelectAircraft = (aircraft: LiveAircraft) => {
    // Directly set the selected aircraft
    setSelectedAircraft(aircraft);
  };

  // Hide panel on mobile - but call all hooks first
  if (isMobile) {
    return null
  }
  
  return (
    <div className="w-[380px] bg-background border-l shadow-lg flex flex-col hidden md:flex">
      <div className="pt-6 pb-3 px-3 border-b">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          <Input
            placeholder="Søg efter fly..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-12 text-lg pl-10 pr-4"
          />
        </div>
      </div>
      <div 
        ref={aircraftListRef}
        className="flex-1 overflow-y-auto px-3 py-2"
      >
        {filteredAircraft.length === 0 ? (
          searchQuery.trim() !== "" ? (
            <p className="text-muted-foreground text-lg p-3 text-center">Ingen resultater for "{searchQuery}"</p>
          ) : (
            <p className="text-muted-foreground text-lg p-3 text-center">Ingen aktive fly sporet</p>
          )
        ) : (
          <div className="space-y-2 pb-3">
            {filteredAircraft.map((ac) => (
              <div 
                key={ac.id}
                ref={selectedAircraft?.id === ac.id ? selectedCardRef : null}
              >
                <AircraftCard
                  aircraft={ac}
                  isSelected={selectedAircraft?.id === ac.id}
                  onSelect={handleSelectAircraft}
                  getFlyingTime={getFlyingTime}
                  isClubPlane={isClubPlane(ac.registration)}
                />
              </div>
            ))}
          </div>
        )}
        
        {!connectionStatus || connectionStatus === 'connecting' ? (
          <div className="p-3 mt-2 mb-2 bg-yellow-50 rounded-lg border border-yellow-200">
            <p className="text-base text-yellow-800 font-medium">⚠ Venter på forbindelse...</p>
          </div>
        ) : connectionStatus === 'disconnected' || connectionStatus === 'error' ? (
          <div className="p-3 mt-2 mb-2 bg-red-50 rounded-lg border border-red-200">
            <p className="text-base text-red-800 font-medium">❌ Forbindelse afbrudt</p>
          </div>
        ) : null}
      </div>
    </div>
  )
}

