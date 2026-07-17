"use client"

import { useEffect, useRef } from "react"
import { haversineMeters } from "@/lib/geo-utils"

interface UseStartbordBeaconOptions {
  enabled: boolean
  deviceId: string | null
  // Called when the server rejects our position (409): another tablet took over
  onRevoked: () => void
}

const SEND_INTERVAL_MS = 5000
const MIN_MOVE_METERS = 10
const MIN_HEADING_DELTA_DEG = 15

// Continuously reports this tablet's geolocation + compass heading to
// /api/tablet/startbord/position while enabled. Throttled: at most every 5 s,
// sooner on a >10 m move or >15° heading change.
export function useStartbordBeacon({ enabled, deviceId, onRevoked }: UseStartbordBeaconOptions) {
  const headingRef = useRef<number | null>(null)
  const lastPositionRef = useRef<GeolocationPosition | null>(null)
  const lastSentRef = useRef<{ lat: number; lon: number; heading: number | null; time: number } | null>(null)
  const inFlightRef = useRef(false)
  const onRevokedRef = useRef(onRevoked)

  useEffect(() => {
    onRevokedRef.current = onRevoked
  }, [onRevoked])

  useEffect(() => {
    if (!enabled || !deviceId) return
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      console.warn('Startbord beacon: geolocation not available (requires HTTPS)')
      return
    }

    let stopped = false

    const sendPosition = async (position: GeolocationPosition, heading: number | null) => {
      if (inFlightRef.current || stopped) return
      inFlightRef.current = true
      try {
        const response = await fetch('/api/tablet/startbord/position', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            deviceId,
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            heading,
            accuracy: position.coords.accuracy ?? undefined
          })
        })

        if (response.status === 409) {
          // Another tablet holds the claim now — stop beaconing
          onRevokedRef.current()
          return
        }

        if (response.ok) {
          lastSentRef.current = {
            lat: position.coords.latitude,
            lon: position.coords.longitude,
            heading,
            time: Date.now()
          }
        }
      } catch (error) {
        console.error('Startbord beacon: failed to send position', error)
      } finally {
        inFlightRef.current = false
      }
    }

    const maybeSend = (position: GeolocationPosition | null) => {
      if (!position || stopped) return
      const heading = headingRef.current
      const last = lastSentRef.current

      if (!last) {
        sendPosition(position, heading)
        return
      }

      const elapsed = Date.now() - last.time
      const moved = haversineMeters(last.lat, last.lon, position.coords.latitude, position.coords.longitude)
      const headingDelta = heading != null && last.heading != null
        ? Math.min(Math.abs(heading - last.heading), 360 - Math.abs(heading - last.heading))
        : (heading != null) !== (last.heading != null) ? Infinity : 0

      if (elapsed >= SEND_INTERVAL_MS || moved >= MIN_MOVE_METERS || headingDelta >= MIN_HEADING_DELTA_DEG) {
        sendPosition(position, heading)
      }
    }

    const handleOrientation = (event: DeviceOrientationEvent) => {
      // iOS exposes a true-north compass heading; other browsers only alpha
      const webkitHeading = (event as any).webkitCompassHeading
      if (typeof webkitHeading === 'number' && !isNaN(webkitHeading)) {
        headingRef.current = webkitHeading
      } else if (event.alpha != null) {
        headingRef.current = (360 - event.alpha) % 360
      }
    }

    window.addEventListener('deviceorientation', handleOrientation)
    window.addEventListener('deviceorientationabsolute', handleOrientation as EventListener)

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        lastPositionRef.current = position
        maybeSend(position)
      },
      (error) => {
        console.error('Startbord beacon: geolocation error', error.message)
      },
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 15000 }
    )

    // Regular tick so heading-only changes and the 5 s cadence still send
    const tick = setInterval(() => maybeSend(lastPositionRef.current), SEND_INTERVAL_MS)

    return () => {
      stopped = true
      navigator.geolocation.clearWatch(watchId)
      window.removeEventListener('deviceorientation', handleOrientation)
      window.removeEventListener('deviceorientationabsolute', handleOrientation as EventListener)
      clearInterval(tick)
      lastSentRef.current = null
    }
  }, [enabled, deviceId])
}
