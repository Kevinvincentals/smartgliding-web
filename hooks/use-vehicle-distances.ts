"use client"

import { useState, useEffect, useMemo } from "react"
import { useStartliste } from "@/contexts/startlist-context"
import { normalizeOgnId } from "@/lib/vehicle-icons"
import { haversineMeters, bearingDegrees } from "@/lib/geo-utils"

interface RegistryVehicle {
  id: string
  name: string
  icon: string
  ogn_id: string
}

interface VehiclePosition {
  latitude: number
  longitude: number
  lastSeen: number
}

export interface VehicleDistance {
  id: string
  name: string
  icon: string
  /** Meters from the startbord, null when either position is unknown */
  distanceMeters: number | null
  /** Bearing from the startbord toward the vehicle, degrees from north (0-360) */
  bearingDeg: number | null
  /** False when the vehicle tracker hasn't reported for 10+ minutes */
  online: boolean
}

const OFFLINE_AFTER_MS = 10 * 60 * 1000

// Feeds the startliste vehicle distance widget without subscribing to the full
// plane-tracker firehose: uses the targeted subscribe_aircraft →
// tracked_aircraft_update path plus the startbord_position channel broadcasts.
export function useVehicleDistances() {
  const { socketRef, wsConnected } = useStartliste()
  const [enabled, setEnabled] = useState(false)
  const [vehicles, setVehicles] = useState<RegistryVehicle[]>([])
  const [positions, setPositions] = useState<Map<string, VehiclePosition>>(new Map())
  const [startbord, setStartbord] = useState<{ latitude: number; longitude: number; heading: number | null } | null>(null)
  const [, setTick] = useState(0)

  // Fetch registry + admin flag + startbord seed
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [vehiclesRes, startbordRes] = await Promise.all([
          fetch('/api/tablet/fetch_vehicles'),
          fetch('/api/tablet/startbord')
        ])

        if (vehiclesRes.ok) {
          const data = await vehiclesRes.json()
          if (data.success) {
            setVehicles(data.vehicles || [])
            setEnabled(data.showVehicleDistanceOutsideMap === true)
          }
        }

        if (startbordRes.ok) {
          const data = await startbordRes.json()
          if (data.success && data.claim && data.claim.latitude != null && data.claim.longitude != null) {
            setStartbord({
              latitude: data.claim.latitude,
              longitude: data.claim.longitude,
              heading: data.claim.heading ?? null
            })
          }
        }
      } catch (error) {
        console.error('Error fetching vehicle distance data:', error)
      }
    }

    fetchData()
  }, [])

  // Subscribe to the vehicles' tracker IDs and consume position updates
  useEffect(() => {
    const socket = socketRef.current
    if (!enabled || vehicles.length === 0 || !socket || socket.readyState !== WebSocket.OPEN) return

    // The tracker matches raw beacon IDs, which may carry an FLR/OGN/ICA prefix
    const aircraftIds = vehicles.flatMap(v => [v.ogn_id, `FLR${v.ogn_id}`, `OGN${v.ogn_id}`, `ICA${v.ogn_id}`])
    const vehicleOgnIds = new Set(vehicles.map(v => normalizeOgnId(v.ogn_id)))

    socket.send(JSON.stringify({ type: 'subscribe_aircraft', aircraft_ids: aircraftIds }))

    const handleMessage = (event: MessageEvent) => {
      if (typeof event.data !== 'string' || !event.data.startsWith('{')) return
      try {
        const message = JSON.parse(event.data)

        if (message.type === 'tracked_aircraft_update' && message.data?.id) {
          const ognId = normalizeOgnId(String(message.data.id))
          if (!vehicleOgnIds.has(ognId)) return
          setPositions(prev => {
            const next = new Map(prev)
            next.set(ognId, {
              latitude: message.data.latitude,
              longitude: message.data.longitude,
              lastSeen: Date.now()
            })
            return next
          })
        } else if (message.type === 'startbord_position') {
          setStartbord({
            latitude: message.latitude,
            longitude: message.longitude,
            heading: message.heading ?? null
          })
        } else if (message.type === 'startbord_removed') {
          setStartbord(null)
        }
      } catch {
        // Not JSON we care about
      }
    }

    socket.addEventListener('message', handleMessage)

    return () => {
      socket.removeEventListener('message', handleMessage)
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'unsubscribe_aircraft', aircraft_ids: aircraftIds }))
      }
    }
  }, [enabled, vehicles, socketRef, wsConnected])

  // Periodic re-render so distances go stale/offline without new messages
  useEffect(() => {
    if (!enabled) return
    const interval = setInterval(() => setTick(t => t + 1), 60000)
    return () => clearInterval(interval)
  }, [enabled])

  const distances: VehicleDistance[] = useMemo(() => {
    return vehicles.map(vehicle => {
      const position = positions.get(normalizeOgnId(vehicle.ogn_id))
      const online = !!position && Date.now() - position.lastSeen < OFFLINE_AFTER_MS
      const hasBoth = online && startbord && position
      const distanceMeters = hasBoth
        ? haversineMeters(startbord.latitude, startbord.longitude, position.latitude, position.longitude)
        : null
      const bearingDeg = hasBoth
        ? bearingDegrees(startbord.latitude, startbord.longitude, position.latitude, position.longitude)
        : null
      return {
        id: vehicle.id,
        name: vehicle.name,
        icon: vehicle.icon,
        distanceMeters,
        bearingDeg,
        online
      }
    })
  }, [vehicles, positions, startbord])

  return {
    // Only show the widget when the club has enabled it and there's a startbord to measure from
    show: enabled && vehicles.length > 0 && startbord !== null,
    distances,
    // Compass heading of the startbord tablet (null while calibrating / unknown)
    startbordHeading: startbord?.heading ?? null
  }
}
