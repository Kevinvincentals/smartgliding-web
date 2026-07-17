"use client"

import { Card } from "@/components/ui/card"
import { Compass, Gauge, Clock, MapPin, Truck } from "lucide-react"
import type { LiveVehicle, StartbordState } from "@/types/live-map"
import { useState, useEffect } from "react"
import { VEHICLE_ICONS, type VehicleIconKey } from "@/lib/vehicle-icons"
import { haversineMeters, formatDistance } from "@/lib/geo-utils"

interface VehicleCardProps {
  vehicle: LiveVehicle
  startbord: StartbordState | null
}

// Sidebar card for a ground vehicle (winch, retrieve car, ...): shows speed,
// heading, distance from the startbord and when it was last heard.
export function VehicleCard({ vehicle, startbord }: VehicleCardProps) {
  const [lastSeenFormatted, setLastSeenFormatted] = useState<string>('N/A')

  const Icon = VEHICLE_ICONS[vehicle.icon as VehicleIconKey] || Truck

  const formatTrack = (track?: number) => {
    if (track === undefined || track === null) return 'N/A'
    return `${track.toFixed(0)}°`
  }

  // Same formatting as the aircraft card: local time + age
  const formatLastSeen = (dateTime?: Date | string) => {
    if (!dateTime) return 'N/A'

    try {
      const dateObj = typeof dateTime === 'string' ? new Date(dateTime) : dateTime
      const formatter = new Intl.DateTimeFormat('da-DK', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
        timeZone: 'Europe/Copenhagen'
      })
      const timeStr = formatter.format(dateObj)

      const diffSec = Math.floor((Date.now() - dateObj.getTime()) / 1000)
      if (diffSec < 3) {
        return `${timeStr} (nu)`
      } else if (diffSec < 60) {
        return `${timeStr} (${diffSec} sek.)`
      } else {
        return `${timeStr} (${Math.floor(diffSec / 60)} min.)`
      }
    } catch (error) {
      console.error('Error formatting last seen time:', error)
      return 'Tidsfejl'
    }
  }

  useEffect(() => {
    setLastSeenFormatted(formatLastSeen(vehicle.lastSeen))
    const interval = setInterval(() => {
      setLastSeenFormatted(formatLastSeen(vehicle.lastSeen))
    }, 1000)
    return () => clearInterval(interval)
  }, [vehicle.lastSeen])

  const distanceMeters = startbord
    ? haversineMeters(startbord.latitude, startbord.longitude, vehicle.latitude, vehicle.longitude)
    : null

  return (
    <Card className="p-4 border-amber-300/60 bg-amber-50/50">
      <div className="flex items-center gap-3 mb-2">
        <div className="p-2 rounded-full bg-amber-100">
          <Icon className="h-6 w-6 text-amber-700" />
        </div>
        <div className="flex-1">
          <div className="flex items-center">
            <h4 className="font-bold text-xl">{vehicle.name}</h4>
            <span className="ml-3 px-2 py-1 text-sm font-medium bg-amber-100 text-amber-800 rounded-md">
              Køretøj
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-base">
        <div className="flex items-center gap-2">
          <Gauge className="h-4 w-4 text-green-500" />
          <div>
            <div className="text-xs text-gray-500">Hastighed</div>
            <div className="font-semibold">{vehicle.speed.toFixed(0)} km/h</div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Compass className="h-4 w-4 text-blue-500" />
          <div>
            <div className="text-xs text-gray-500">Kurs</div>
            <div className="font-semibold">{formatTrack(vehicle.track)}</div>
          </div>
        </div>

        {distanceMeters != null && (
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-amber-600" />
            <div>
              <div className="text-xs text-gray-500">Afstand til startbord</div>
              <div className="font-semibold">{formatDistance(distanceMeters)}</div>
            </div>
          </div>
        )}

        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-gray-500" />
          <div>
            <div className="text-xs text-gray-500">Sidst set</div>
            <div className="font-semibold text-sm">{lastSeenFormatted}</div>
          </div>
        </div>
      </div>
    </Card>
  )
}
