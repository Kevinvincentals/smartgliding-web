"use client"

import { useState, useEffect } from "react"
import { Badge } from "@/components/ui/badge"
import { Truck, ArrowUp } from "lucide-react"
import { useVehicleDistances } from "@/hooks/use-vehicle-distances"
import { VEHICLE_ICONS, type VehicleIconKey } from "@/lib/vehicle-icons"
import { formatDistance } from "@/lib/geo-utils"
import { isStartbordActive, STARTBORD_ACTIVE_EVENT } from "@/lib/startbord"

// Compact badges showing the distance + direction from the startbord to each
// ground vehicle (e.g. "Wirehenter ↗ 850 m"). Only rendered when the club
// admin has enabled it and a startbord tablet is active; the livemap shows
// distances regardless of this widget.
export function VehicleDistanceWidget() {
  const { show, distances, startbordHeading } = useVehicleDistances()
  const [isThisTabletStartbord, setIsThisTabletStartbord] = useState(false)

  // On the startbord tablet itself we know which way the tablet faces, so the
  // arrow can point physically toward the vehicle instead of relative to north
  useEffect(() => {
    setIsThisTabletStartbord(isStartbordActive())
    const handleActiveChanged = () => setIsThisTabletStartbord(isStartbordActive())
    window.addEventListener(STARTBORD_ACTIVE_EVENT, handleActiveChanged)
    return () => window.removeEventListener(STARTBORD_ACTIVE_EVENT, handleActiveChanged)
  }, [])

  if (!show) return null

  const arrowRotation = (bearingDeg: number): number => {
    if (isThisTabletStartbord && startbordHeading != null) {
      return (bearingDeg - startbordHeading + 360) % 360
    }
    return bearingDeg // north-referenced, like the map
  }

  return (
    <>
      {distances.map(vehicle => {
        const Icon = VEHICLE_ICONS[vehicle.icon as VehicleIconKey] || Truck
        return (
          <Badge
            key={vehicle.id}
            className="bg-amber-100 hover:bg-amber-100 text-amber-800 border border-amber-300 px-2.5 py-1 text-sm font-medium whitespace-nowrap flex items-center gap-1.5"
          >
            <Icon className="h-3.5 w-3.5" />
            <span>{vehicle.name}</span>
            {vehicle.online && vehicle.distanceMeters != null ? (
              <>
                {vehicle.bearingDeg != null && (
                  <ArrowUp
                    className="h-3.5 w-3.5"
                    style={{ transform: `rotate(${arrowRotation(vehicle.bearingDeg)}deg)` }}
                  />
                )}
                <span>{formatDistance(vehicle.distanceMeters)}</span>
              </>
            ) : (
              <span>· offline</span>
            )}
          </Badge>
        )
      })}
    </>
  )
}
