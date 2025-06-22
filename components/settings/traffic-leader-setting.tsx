"use client"

import { useEffect, useState } from "react"
import { Label } from "@/components/ui/label"
import { Combobox } from "@/components/ui/combobox"
import { Loader2, X } from "lucide-react"
import { Button } from "@/components/ui/button"

interface Pilot {
  id: string
  name: string
}

interface TrafficLeaderSettingProps {
  pilots: Pilot[]
  trafficLeaderId: string
  setTrafficLeaderId: (id: string) => void
  customTrafficLeader: string
  setCustomTrafficLeader: (name: string) => void
  isLoading: boolean
  isInitialLoading: boolean
  onFocus: () => void
  onClear: () => void
}

export function TrafficLeaderSetting({
  pilots,
  trafficLeaderId,
  setTrafficLeaderId,
  customTrafficLeader,
  setCustomTrafficLeader,
  isLoading,
  isInitialLoading,
  onFocus,
  onClear
}: TrafficLeaderSettingProps) {
  const [hasFocused, setHasFocused] = useState(false);

  // Call onFocus only once when component mounts
  useEffect(() => {
    if (!hasFocused && pilots.length === 0 && !isInitialLoading) {
      onFocus();
      setHasFocused(true);
    }
  }, [hasFocused, pilots.length, onFocus, isInitialLoading]);

  return (
    <div className="grid gap-2" onClick={() => {
      if (!hasFocused && pilots.length === 0 && !isInitialLoading && !isLoading) {
        onFocus();
        setHasFocused(true);
      }
    }}>
      <Label className="text-base" htmlFor="traffic-leader">
        Trafikleder
      </Label>
      <div className="relative">
        {isInitialLoading ? (
          <Button
            variant="outline"
            className="w-full justify-between h-12 text-base text-muted-foreground cursor-wait"
            disabled
          >
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Indlæser piloter...
            </div>
          </Button>
        ) : (
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Combobox
                items={pilots.map((pilot) => ({
                  label: pilot.name,
                  value: pilot.id,
                }))}
                value={trafficLeaderId}
                onChange={(value) => setTrafficLeaderId(value)}
                onTextChange={(text) => setCustomTrafficLeader(text)}
                placeholder="Søg eller indtast trafikleder"
                initialSearchMode={true}
              />
              {isLoading && (
                <div className="absolute right-10 top-1/2 transform -translate-y-1/2">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              )}
            </div>
            {(trafficLeaderId || customTrafficLeader) && (
              <Button
                variant="outline"
                size="icon"
                className="h-12 w-12 flex-shrink-0"
                onClick={onClear}
                title="Fjern trafikleder"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

