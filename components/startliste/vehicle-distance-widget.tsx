"use client"

import { Badge } from "@/components/ui/badge"
import { Truck } from "lucide-react"
import { useVehicleDistances } from "@/hooks/use-vehicle-distances"
import { VEHICLE_ICONS, type VehicleIconKey } from "@/lib/vehicle-icons"
import { formatDistance } from "@/lib/geo-utils"

// Compact badges showing the distance from the startbord to each ground
// vehicle (e.g. "Wirehenter · 850 m"). Only rendered when the club admin has
// enabled it and a startbord tablet is active; the livemap shows distances
// regardless of this widget.
export function VehicleDistanceWidget() {
  const { show, distances } = useVehicleDistances()

  if (!show) return null

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
            <span>
              {vehicle.name}
              {vehicle.online && vehicle.distanceMeters != null
                ? ` · ${formatDistance(vehicle.distanceMeters)}`
                : ' · offline'}
            </span>
          </Badge>
        )
      })}
    </>
  )
}
