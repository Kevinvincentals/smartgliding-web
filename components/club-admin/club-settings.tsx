"use client"

import { useState, useEffect } from "react"
import { MapPin } from "lucide-react"
import { toast as hotToast } from 'react-hot-toast'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Skeleton } from "@/components/ui/skeleton"

export function ClubSettings() {
  const [isLoading, setIsLoading] = useState(true)
  const [showVehicleDistance, setShowVehicleDistance] = useState(false)

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const response = await fetch('/api/club/admin/update_settings', {
          credentials: 'include'
        })
        if (response.ok) {
          const data = await response.json()
          setShowVehicleDistance(data.settings?.startbord_show_vehicle_distance ?? false)
        }
      } catch (error) {
        console.error('Error fetching settings:', error)
      } finally {
        setIsLoading(false)
      }
    }

    fetchSettings()
  }, [])

  const handleToggleVehicleDistance = async (checked: boolean) => {
    setShowVehicleDistance(checked)
    try {
      const response = await fetch('/api/club/admin/update_settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ startbord_show_vehicle_distance: checked }),
      })

      if (!response.ok) {
        throw new Error('Failed to update settings')
      }

      hotToast.success("Indstillinger gemt")
    } catch (error) {
      console.error('Error updating settings:', error)
      setShowVehicleDistance(!checked)
      hotToast.error("Kunne ikke gemme indstillinger")
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Klub Indstillinger</CardTitle>
        <CardDescription>
          Konfigurer klub specifikke indstillinger og præferencer.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-4 w-[300px]" />
            <Skeleton className="h-4 w-[200px]" />
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="show-vehicle-distance" className="flex items-center">
                <MapPin className="h-4 w-4 mr-2" />
                Vis afstand til køretøjer på startlisten
              </Label>
              <p className="text-sm text-muted-foreground">
                Viser hvor langt køretøjer (fx wirehenter) er fra startbordet direkte på startlisten.
                Afstanden vises altid på live kortet.
              </p>
            </div>
            <Switch
              id="show-vehicle-distance"
              checked={showVehicleDistance}
              onCheckedChange={handleToggleVehicleDistance}
            />
          </div>
        )}
      </CardContent>
    </Card>
  )
}
