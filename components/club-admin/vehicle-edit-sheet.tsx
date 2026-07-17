"use client"

import { useState, useEffect } from "react"
import { Truck, Save, X } from "lucide-react"
import { toast as hotToast } from 'react-hot-toast'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { VehicleIconPicker } from "./vehicle-icon-picker"
import type { VehicleIconKey } from "@/lib/vehicle-icons"

interface VehicleEditSheetProps {
  vehicle: { id: string; name: string; icon: string; ogn_id: string } | null
  isOpen: boolean
  onClose: () => void
  onUpdate: (updatedVehicle: any) => void
}

export function VehicleEditSheet({ vehicle, isOpen, onClose, onUpdate }: VehicleEditSheetProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    icon: 'car' as VehicleIconKey,
    ogn_id: ''
  })

  useEffect(() => {
    if (vehicle) {
      setFormData({
        name: vehicle.name,
        icon: vehicle.icon as VehicleIconKey,
        ogn_id: vehicle.ogn_id
      })
    }
  }, [vehicle])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!vehicle) return

    if (!formData.name || !formData.ogn_id) {
      hotToast.error("Navn og OGN ID er påkrævet")
      return
    }

    setIsLoading(true)
    try {
      const response = await fetch('/api/club/admin/update_vehicle', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          vehicleId: vehicle.id,
          name: formData.name,
          icon: formData.icon,
          ogn_id: formData.ogn_id
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(typeof errorData.error === 'string' ? errorData.error : 'Failed to update vehicle')
      }

      const data = await response.json()
      hotToast.success(`${formData.name} er opdateret`)

      onUpdate(data.vehicle)
      onClose()
    } catch (error: any) {
      console.error('Error updating vehicle:', error)
      hotToast.error(error.message || "Kunne ikke opdatere køretøj")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent className="w-[500px] sm:w-[600px]">
        <SheetHeader>
          <SheetTitle className="flex items-center">
            <Truck className="h-5 w-5 mr-2" />
            Rediger Køretøj
          </SheetTitle>
          <SheetDescription>
            Opdater køretøjets navn, ikon eller OGN ID.
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="space-y-6 mt-6">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit_vehicle_name">Navn *</Label>
              <Input
                id="edit_vehicle_name"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Spil, Wirehenter, ..."
                required
              />
            </div>

            <VehicleIconPicker
              value={formData.icon}
              onChange={(icon) => setFormData(prev => ({ ...prev, icon }))}
            />

            <div className="space-y-2">
              <Label htmlFor="edit_vehicle_ogn_id">OGN ID *</Label>
              <Input
                id="edit_vehicle_ogn_id"
                value={formData.ogn_id}
                onChange={(e) => setFormData(prev => ({ ...prev, ogn_id: e.target.value.toUpperCase() }))}
                placeholder="DD1234"
                required
              />
              <p className="text-xs text-muted-foreground">
                ID på den OGN tracker der er monteret i køretøjet (6 hex-tegn, evt. med FLR/OGN prefix)
              </p>
            </div>
          </div>

          <div className="flex justify-end space-x-2 pt-4 border-t">
            <Button type="button" variant="outline" onClick={onClose} disabled={isLoading}>
              <X className="h-4 w-4 mr-2" />
              Annuller
            </Button>
            <Button type="submit" disabled={isLoading}>
              <Save className="h-4 w-4 mr-2" />
              {isLoading ? "Gemmer..." : "Gem Ændringer"}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  )
}
