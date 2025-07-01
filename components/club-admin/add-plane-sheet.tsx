"use client"

import { useState } from "react"
import { Plane, Save, X, AlertTriangle } from "lucide-react"
import { toast as hotToast } from 'react-hot-toast'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { 
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Alert, AlertDescription } from "@/components/ui/alert"

interface AddPlaneSheetProps {
  isOpen: boolean
  onClose: () => void
  onAdd: (newPlane: any) => void
}

export function AddPlaneSheet({ isOpen, onClose, onAdd }: AddPlaneSheetProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [formData, setFormData] = useState({
    registration_id: '',
    flarm_id: '',
    competition_id: '',
    type: '',
    is_twoseater: false,
    is_guest: false,
    year_produced: '',
    notes: ''
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!formData.registration_id || !formData.type) {
      hotToast.error("Registrering og flytype er påkrævet")
      return
    }

    setIsLoading(true)
    try {
      const response = await fetch('/api/club/admin/create_plane', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          registration_id: formData.registration_id,
          flarm_id: formData.flarm_id || null,
          competition_id: formData.competition_id || null,
          type: formData.type,
          is_twoseater: formData.is_twoseater,
          is_guest: formData.is_guest,
          year_produced: formData.year_produced ? parseInt(formData.year_produced) : null,
          notes: formData.notes || null
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to create plane')
      }

      const data = await response.json()

      if (!formData.flarm_id) {
        hotToast.success(`${formData.registration_id} er oprettet - husk at tilføje FLARM ID senere!`, {
          duration: 5000,
        })
      } else {
        hotToast.success(`${formData.registration_id} er oprettet og tilføjet til klubben`)
      }

      onAdd(data.plane)
      handleClose()
    } catch (error: any) {
      console.error('Error creating plane:', error)
      hotToast.error(error.message || "Kunne ikke oprette fly")
    } finally {
      setIsLoading(false)
    }
  }

  const handleClose = () => {
    setFormData({
      registration_id: '',
      flarm_id: '',
      competition_id: '',
      type: '',
      is_twoseater: false,
      is_guest: false,
      year_produced: '',
      notes: ''
    })
    onClose()
  }

  const handleInputChange = (field: string, value: string | boolean) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }))
  }

  return (
    <Sheet open={isOpen} onOpenChange={handleClose}>
      <SheetContent className="w-[500px] sm:w-[600px] lg:w-[700px]">
        <SheetHeader>
          <SheetTitle className="flex items-center">
            <Plane className="h-5 w-5 mr-2" />
            Tilføj Nyt Fly
          </SheetTitle>
          <SheetDescription>
            Opret et nyt fly og tilføj det til klubben.
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="space-y-6 mt-6">
          {/* FLARM Warning */}
          {!formData.flarm_id && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                <strong>Vigtigt:</strong> FLARM ID er påkrævet for automatisk registrering af start og landing. 
                Du kan tilføje det nu eller redigere flyet senere.
              </AlertDescription>
            </Alert>
          )}

          {/* Basic Information */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium">Grundlæggende oplysninger</h3>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="registration_id">Registrering *</Label>
                <Input
                  id="registration_id"
                  value={formData.registration_id}
                  onChange={(e) => handleInputChange('registration_id', e.target.value.toUpperCase())}
                  placeholder="OY-ABC"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="type">Flytype *</Label>
                <Input
                  id="type"
                  value={formData.type}
                  onChange={(e) => handleInputChange('type', e.target.value)}
                  placeholder="DG-1000, ASK-21, etc."
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="flarm_id">FLARM ID</Label>
                <Input
                  id="flarm_id"
                  value={formData.flarm_id}
                  onChange={(e) => handleInputChange('flarm_id', e.target.value.toUpperCase())}
                  placeholder="DD1234"
                />
                <p className="text-xs text-muted-foreground">
                  Påkrævet for automatisk start/landing registrering
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="competition_id">Konkurrence ID</Label>
                <Input
                  id="competition_id"
                  value={formData.competition_id}
                  onChange={(e) => handleInputChange('competition_id', e.target.value.toUpperCase())}
                  placeholder="AB, 123, etc."
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="year_produced">Produktionsår</Label>
              <Input
                id="year_produced"
                type="number"
                value={formData.year_produced}
                onChange={(e) => handleInputChange('year_produced', e.target.value)}
                placeholder="2020"
                min="1900"
                max={new Date().getFullYear()}
              />
            </div>
          </div>

          {/* Fly Characteristics */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium">Flyets egenskaber</h3>
            
            <div className="space-y-4">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="is_twoseater"
                  checked={formData.is_twoseater}
                  onCheckedChange={(checked) => handleInputChange('is_twoseater', checked as boolean)}
                />
                <Label htmlFor="is_twoseater">2-sædet fly</Label>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="is_guest"
                  checked={formData.is_guest}
                  onCheckedChange={(checked) => handleInputChange('is_guest', checked as boolean)}
                />
                <Label htmlFor="is_guest">Gæstefly (ikke klub ejet)</Label>
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium">Noter</h3>
            
            <div className="space-y-2">
              <Label htmlFor="notes">Bemærkninger</Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => handleInputChange('notes', e.target.value)}
                placeholder="Særlige bemærkninger om flyet..."
                rows={3}
              />
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end space-x-2 pt-4 border-t">
            <Button type="button" variant="outline" onClick={handleClose} disabled={isLoading}>
              <X className="h-4 w-4 mr-2" />
              Annuller
            </Button>
            <Button type="submit" disabled={isLoading}>
              <Save className="h-4 w-4 mr-2" />
              {isLoading ? "Opretter..." : "Opret Fly"}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  )
}