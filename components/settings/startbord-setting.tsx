"use client"

import { useState, useEffect } from "react"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import { Loader2, MapPin, MapPinOff } from "lucide-react"
import { useToast } from "@/components/ui/use-toast"
import {
  getStartbordDeviceId,
  isStartbordActive,
  setStartbordActive,
  STARTBORD_ACTIVE_EVENT
} from "@/lib/startbord"

// Settings toggle that designates this tablet as the "startbord tablet".
// While active, the beacon runner (mounted in the startliste layout) reports
// this tablet's position + compass heading so it shows on the livemap.
export function StartbordSetting() {
  const { toast } = useToast()
  const [isLoading, setIsLoading] = useState(true)
  const [isWorking, setIsWorking] = useState(false)
  const [enabled, setEnabled] = useState(false)
  const [otherTabletClaims, setOtherTabletClaims] = useState(false)

  useEffect(() => {
    const deviceId = getStartbordDeviceId()
    setEnabled(isStartbordActive())

    // Check who currently holds the claim for this club + airfield
    const fetchClaim = async () => {
      try {
        const response = await fetch('/api/tablet/startbord')
        if (response.ok) {
          const data = await response.json()
          if (data.success && data.claim) {
            const isMine = data.claim.deviceId === deviceId
            setOtherTabletClaims(!isMine)
            // If another tablet took over while we were away, drop our local flag
            if (!isMine && isStartbordActive()) {
              setStartbordActive(false)
              setEnabled(false)
            }
          } else {
            setOtherTabletClaims(false)
            // Claim is gone (e.g. released elsewhere) — drop a stale local flag
            if (isStartbordActive()) {
              setStartbordActive(false)
              setEnabled(false)
            }
          }
        }
      } catch (error) {
        console.error('Error fetching startbord claim:', error)
      } finally {
        setIsLoading(false)
      }
    }

    fetchClaim()

    // Stay in sync if the beacon runner revokes the flag (takeover / 409)
    const handleActiveChanged = () => setEnabled(isStartbordActive())
    window.addEventListener(STARTBORD_ACTIVE_EVENT, handleActiveChanged)
    return () => window.removeEventListener(STARTBORD_ACTIVE_EVENT, handleActiveChanged)
  }, [])

  const handleToggle = async (checked: boolean) => {
    if (isWorking) return
    setIsWorking(true)
    const deviceId = getStartbordDeviceId()

    try {
      if (checked) {
        // iOS requires the motion/orientation permission prompt to be triggered
        // by a user gesture — request it first, before any await
        const OrientationEvent = typeof DeviceOrientationEvent !== 'undefined' ? (DeviceOrientationEvent as any) : null
        if (OrientationEvent && typeof OrientationEvent.requestPermission === 'function') {
          try {
            const permission = await OrientationEvent.requestPermission()
            if (permission !== 'granted') {
              toast({
                title: "Kompas ikke tilladt",
                description: "Retningen kan ikke vises, men positionen sendes stadig.",
              })
            }
          } catch (error) {
            console.warn('DeviceOrientation permission request failed:', error)
          }
        }

        if (!navigator.geolocation || !window.isSecureContext) {
          toast({
            title: "Placering ikke tilgængelig",
            description: "Startbord funktionen kræver HTTPS og adgang til placering.",
            variant: "destructive",
          })
          return
        }

        // Trigger the geolocation permission prompt and verify access
        await new Promise<void>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(
            () => resolve(),
            (error) => reject(error),
            { enableHighAccuracy: true, timeout: 15000 }
          )
        })

        const response = await fetch('/api/tablet/startbord/claim', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ deviceId })
        })

        if (!response.ok) {
          throw new Error('Kunne ikke aktivere startbord')
        }

        setStartbordActive(true)
        setEnabled(true)
        setOtherTabletClaims(false)
        toast({
          title: "Startbord aktiveret",
          description: "Denne tablet sender nu sin placering til live kortet.",
        })
      } else {
        // Clear the local flag first so our own startbord_removed broadcast
        // isn't mistaken for a takeover by the beacon runner
        setStartbordActive(false)
        setEnabled(false)

        await fetch('/api/tablet/startbord/release', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ deviceId })
        })

        toast({
          title: "Startbord deaktiveret",
          description: "Denne tablet sender ikke længere sin placering.",
        })
      }
    } catch (error: any) {
      console.error('Error toggling startbord:', error)
      const isPermissionDenied = error && typeof error === 'object' && 'code' in error && error.code === 1
      toast({
        title: "Kunne ikke aktivere startbord",
        description: isPermissionDenied
          ? "Adgang til placering blev afvist. Tillad placering for Safari i Indstillinger."
          : (error?.message || "Prøv igen."),
        variant: "destructive",
      })
    } finally {
      setIsWorking(false)
    }
  }

  // Force-release so NO tablet is startbord (e.g. the claiming iPad is gone).
  // Clears the marker + distances from every tablet's livemap.
  const handleForceDisable = async () => {
    if (isWorking) return
    setIsWorking(true)
    try {
      await fetch('/api/tablet/startbord/release', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId: getStartbordDeviceId(), force: true })
      })
      setOtherTabletClaims(false)
      toast({
        title: "Startbord deaktiveret",
        description: "Ingen tablet er nu startbord.",
      })
    } catch (error) {
      console.error('Error force-disabling startbord:', error)
      toast({
        title: "Kunne ikke deaktivere startbord",
        description: "Prøv igen.",
        variant: "destructive",
      })
    } finally {
      setIsWorking(false)
    }
  }

  return (
    <div className="flex items-center justify-between mt-4">
      <div className="space-y-0.5">
        <Label className="text-base flex items-center" htmlFor="startbord-tablet">
          <MapPin className="h-4 w-4 mr-2" />
          Startbord Tablet
        </Label>
        <p className="text-sm text-muted-foreground">
          Denne tablet står ved startbordet og deler sin placering og retning på live kortet
        </p>
        {otherTabletClaims && !enabled && (
          <>
            <p className="text-sm text-amber-600">
              En anden tablet er i øjeblikket startbord. Aktivering her overtager rollen.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-1"
              disabled={isWorking}
              onClick={handleForceDisable}
            >
              <MapPinOff className="h-4 w-4 mr-2" />
              Deaktiver startbord
            </Button>
          </>
        )}
      </div>
      <div className="w-[44px] h-[24px] flex items-center justify-center">
        {isLoading || isWorking ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : (
          <Switch id="startbord-tablet" checked={enabled} onCheckedChange={handleToggle} />
        )}
      </div>
    </div>
  )
}
