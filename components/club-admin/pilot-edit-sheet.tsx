"use client"

import { useState, useEffect } from "react"
import { User, Mail, Phone, Shield, Save, X } from "lucide-react"
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
import { useToast } from "@/components/ui/use-toast"
import { Badge } from "@/components/ui/badge"

interface ClubPilot {
  id: string
  role: 'ADMIN' | 'USER'
  pilot: {
    id: string
    firstname: string
    lastname: string
    email: string
    phone?: string
    dsvu_id?: string
    status: 'ACTIVE' | 'INACTIVE' | 'PENDING'
    membership: 'A' | 'B' | 'C' | 'BASIC' | 'PREMIUM' | 'VIP'
  }
}

interface PilotEditSheetProps {
  pilot: ClubPilot | null
  isOpen: boolean
  onClose: () => void
  onUpdate: (updatedPilot: any) => void
}

export function PilotEditSheet({ pilot, isOpen, onClose, onUpdate }: PilotEditSheetProps) {
  const { toast } = useToast()
  const [isLoading, setIsLoading] = useState(false)
  const [formData, setFormData] = useState({
    firstname: '',
    lastname: '',
    email: '',
    phone: '',
    dsvu_id: '',
    status: 'ACTIVE' as 'ACTIVE' | 'INACTIVE' | 'PENDING',
    membership: 'A' as 'A' | 'B' | 'C' | 'BASIC' | 'PREMIUM' | 'VIP',
    role: 'USER' as 'ADMIN' | 'USER',
    personal_pin: ''
  })

  // Reset form when pilot changes
  useEffect(() => {
    if (pilot) {
      setFormData({
        firstname: pilot.pilot.firstname || '',
        lastname: pilot.pilot.lastname || '',
        email: pilot.pilot.email || '',
        phone: pilot.pilot.phone || '',
        dsvu_id: pilot.pilot.dsvu_id || '',
        status: pilot.pilot.status,
        membership: pilot.pilot.membership,
        role: pilot.role,
        personal_pin: ''
      })
    }
  }, [pilot])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!pilot) return

    setIsLoading(true)
    try {
      // Update pilot basic info
      const pilotResponse = await fetch('/api/club/admin/update_pilot', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          pilotId: pilot.pilot.id,
          firstname: formData.firstname,
          lastname: formData.lastname,
          email: formData.email,
          phone: formData.phone || null,
          dsvu_id: formData.dsvu_id || null,
          status: formData.status,
          membership: formData.membership,
          personal_pin: formData.personal_pin || null
        }),
      })

      if (!pilotResponse.ok) {
        throw new Error('Failed to update pilot information')
      }

      const pilotData = await pilotResponse.json()
      let updatedPilot = pilotData.pilot

      // Update role if changed
      if (formData.role !== pilot.role) {
        const roleResponse = await fetch('/api/club/admin/update_role', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({
            pilotId: pilot.pilot.id,
            role: formData.role
          }),
        })

        if (!roleResponse.ok) {
          throw new Error('Failed to update pilot role')
        }
      }

      // Create updated pilot object with new data
      updatedPilot = {
        ...updatedPilot,
        membership: formData.membership,
        status: formData.status
      }

      toast({
        title: "Pilot opdateret",
        description: "Pilotens oplysninger er blevet gemt",
        variant: "default",
      })

      onUpdate(updatedPilot) // Pass the updated pilot data
      onClose()   // Close the sheet
    } catch (error: any) {
      console.error('Error updating pilot:', error)
      toast({
        title: "Fejl",
        description: error.message || "Kunne ikke opdatere pilot",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }))
  }

  if (!pilot) return null

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent className="w-[400px] sm:w-[540px]">
        <SheetHeader>
          <SheetTitle className="flex items-center">
            <User className="h-5 w-5 mr-2" />
            Rediger Pilot
          </SheetTitle>
          <SheetDescription>
            Opdater pilotens oplysninger, rolle og indstillinger.
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="space-y-6 mt-6">
          {/* Basic Information */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium">Grundlæggende oplysninger</h3>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="firstname">Fornavn</Label>
                <Input
                  id="firstname"
                  value={formData.firstname}
                  onChange={(e) => handleInputChange('firstname', e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastname">Efternavn</Label>
                <Input
                  id="lastname"
                  value={formData.lastname}
                  onChange={(e) => handleInputChange('lastname', e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => handleInputChange('email', e.target.value)}
                placeholder="Valgfrit"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">Telefon</Label>
              <Input
                id="phone"
                value={formData.phone}
                onChange={(e) => handleInputChange('phone', e.target.value)}
                placeholder="Valgfrit"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="dsvu_id">DSVU ID</Label>
              <Input
                id="dsvu_id"
                value={formData.dsvu_id}
                onChange={(e) => handleInputChange('dsvu_id', e.target.value)}
                placeholder="Valgfrit"
              />
            </div>
          </div>

          {/* Status and Membership */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium">Status og medlemskab</h3>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="status">Status</Label>
                <Select value={formData.status} onValueChange={(value: 'ACTIVE' | 'INACTIVE' | 'PENDING') => handleInputChange('status', value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ACTIVE">Aktiv</SelectItem>
                    <SelectItem value="INACTIVE">Inaktiv</SelectItem>
                    <SelectItem value="PENDING">Afventer</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="membership">Medlemskab</Label>
                <Select value={formData.membership} onValueChange={(value: 'A' | 'B' | 'C' | 'BASIC' | 'PREMIUM' | 'VIP') => handleInputChange('membership', value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="A">A</SelectItem>
                    <SelectItem value="B">B</SelectItem>
                    <SelectItem value="C">C</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Role and Security */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium">Rolle og sikkerhed</h3>
            
            <div className="space-y-2">
              <Label htmlFor="role">Rolle i klubben</Label>
              <Select value={formData.role} onValueChange={(value: 'ADMIN' | 'USER') => handleInputChange('role', value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="USER">
                    <div className="flex items-center">
                      <User className="h-4 w-4 mr-2" />
                      Medlem
                    </div>
                  </SelectItem>
                  <SelectItem value="ADMIN">
                    <div className="flex items-center">
                      <Shield className="h-4 w-4 mr-2" />
                      Administrator
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="personal_pin">Personal PIN (4 cifre)</Label>
              <Input
                id="personal_pin"
                type="password"
                value={formData.personal_pin}
                onChange={(e) => handleInputChange('personal_pin', e.target.value.replace(/\D/g, '').slice(0, 4))}
                placeholder="Lad stå tom for at beholde nuværende"
                maxLength={4}
              />
              <p className="text-xs text-muted-foreground">
                Bruges til admin login. Lad stå tom for ikke at ændre.
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end space-x-2 pt-4">
            <Button type="button" variant="outline" onClick={onClose} disabled={isLoading}>
              <X className="h-4 w-4 mr-2" />
              Annuller
            </Button>
            <Button type="submit" disabled={isLoading}>
              <Save className="h-4 w-4 mr-2" />
              {isLoading ? "Gemmer..." : "Gem ændringer"}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  )
}