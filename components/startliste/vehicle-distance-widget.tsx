"use client"

import { useState, useEffect } from "react"
import { Badge } from "@/components/ui/badge"
import { Truck, ArrowUp } from "lucide-react"
import { useVehicleDistances } from "@/hooks/use-vehicle-distances"
import { VEHICLE_ICONS, type VehicleIconKey } from "@/lib/vehicle-icons"
import { formatDistance } from "@/lib/geo-utils"
import { isStartbordActive, STARTBORD_ACTIVE_EVENT } from "@/lib/startbord"

// Compact badges showing the distance + direction from the startbord to each
// ground vehicle (e.g. "Wirehenter ↗ 850 m"). ONLY rendered on the startbord
// tablet itself (and only when the club admin has enabled it) — every other
// tablet sees vehicle distances on the livemap instead.
export function VehicleDistanceWidget() {
  const [isThisTabletStartbord, setIsThisTabletStartbord] = useState(false)
  const { show, distances, startbordHeading } = useVehicleDistances(isThisTabletStartbord)

  useEffect(() => {
    setIsThisTabletStartbord(isStartbordActive())
    const handleActiveChanged = () => setIsThisTabletStartbord(isStartbordActive())
    window.addEventListener(STARTBORD_ACTIVE_EVENT, handleActiveChanged)
    return () => window.removeEventListener(STARTBORD_ACTIVE_EVENT, handleActiveChanged)
  }, [])

  if (!isThisTabletStartbord || !show) return null

  // This tablet is the startbord, so we know which way it faces: rotate the
  // arrow relative to the tablet's heading so it physically points toward the
  // vehicle. Falls back to north-referenced while the compass is calibrating.
  const arrowRotation = (bearingDeg: number): number => {
    if (startbordHeading != null) {
      return (bearingDeg - startbordHeading + 360) % 360
    }
    return bearingDeg
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
