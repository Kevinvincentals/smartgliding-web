"use client"

import { useState, useEffect } from "react"
import { useStartliste } from "@/contexts/startlist-context"
import { useStartbordBeacon } from "@/hooks/use-startbord-beacon"
import { useToast } from "@/components/ui/use-toast"
import {
  getStartbordDeviceId,
  isStartbordActive,
  setStartbordActive,
  STARTBORD_ACTIVE_EVENT
} from "@/lib/startbord"

// Invisible component mounted in the startliste layout. Runs the startbord
// position beacon while this tablet holds the startbord role, so it keeps
// working across page navigation and reloads. Stops automatically when
// another tablet takes over (startbord_changed broadcast or 409 response).
export function StartbordBeaconRunner() {
  const { socketRef, wsConnected } = useStartliste()
  const { toast } = useToast()
  const [active, setActive] = useState(false)
  const [deviceId, setDeviceId] = useState<string | null>(null)

  // Read localStorage after mount (SSR-safe) and track changes from the settings page
  useEffect(() => {
    setDeviceId(getStartbordDeviceId())
    setActive(isStartbordActive())

    const handleActiveChanged = () => setActive(isStartbordActive())
    window.addEventListener(STARTBORD_ACTIVE_EVENT, handleActiveChanged)
    return () => window.removeEventListener(STARTBORD_ACTIVE_EVENT, handleActiveChanged)
  }, [])

  // Stop when another tablet claims the startbord role
  useEffect(() => {
    const socket = socketRef.current
    if (!socket || !deviceId) return

    const handleMessage = (event: MessageEvent) => {
      if (typeof event.data !== 'string' || !event.data.startsWith('{')) return
      try {
        const message = JSON.parse(event.data)
        if (message.type === 'startbord_changed' && message.deviceId !== deviceId && isStartbordActive()) {
          setStartbordActive(false)
          toast({
            title: "Startbord overtaget",
            description: "En anden tablet er nu startbord.",
          })
        } else if (message.type === 'startbord_removed' && isStartbordActive()) {
          // Another tablet force-disabled the startbord role
          setStartbordActive(false)
          toast({
            title: "Startbord deaktiveret",
            description: "Startbord blev deaktiveret fra en anden tablet.",
          })
        }
      } catch {
        // Not JSON we care about
      }
    }

    socket.addEventListener('message', handleMessage)
    return () => socket.removeEventListener('message', handleMessage)
  }, [socketRef, wsConnected, deviceId, toast])

  useStartbordBeacon({
    enabled: active,
    deviceId,
    onRevoked: () => {
      setStartbordActive(false)
      toast({
        title: "Startbord overtaget",
        description: "En anden tablet er nu startbord. Placeringsdeling er stoppet.",
      })
    }
  })

  return null
}
