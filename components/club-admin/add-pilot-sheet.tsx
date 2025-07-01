"use client"

import { useState } from "react"
import { UserPlus, Save, X, Search, Plus, ArrowRight } from "lucide-react"
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
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useToast } from "@/components/ui/use-toast"

interface AddPilotSheetProps {
  isOpen: boolean
  onClose: () => void
  onAdd: (newPilot: any) => void
}

interface ExistingPilot {
  id: string
  firstname: string
  lastname: string
  email: string
  phone?: string
  dsvu_id?: string
  status: string
  membership: string
}

export function AddPilotSheet({ isOpen, onClose, onAdd }: AddPilotSheetProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [step, setStep] = useState<'search' | 'create'>('search')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<ExistingPilot[]>([])
  const [hasSearched, setHasSearched] = useState(false)
  const [formData, setFormData] = useState({
    firstname: '',
    lastname: '',
    email: '',
    phone: '',
    dsvu_id: '',
    status: 'ACTIVE' as 'ACTIVE' | 'INACTIVE' | 'PENDING',
    membership: 'A' as 'A' | 'B' | 'C',
    role: 'USER' as 'ADMIN' | 'USER',
    personal_pin: ''
  })

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!searchQuery.trim()) {
      hotToast.error("Indtast navn for at søge")
      return
    }

    setIsLoading(true)
    try {
      const response = await fetch(`/api/club/admin/search_pilots?query=${encodeURIComponent(searchQuery)}`, {
        credentials: 'include'
      })

      if (!response.ok) {
        throw new Error('Failed to search pilots')
      }

      const data = await response.json()
      setSearchResults(data.pilots || [])
      setHasSearched(true)
    } catch (error) {
      console.error('Error searching pilots:', error)
      hotToast.error("Kunne ikke søge efter piloter")
    } finally {
      setIsLoading(false)
    }
  }

  const handleAssignExistingPilot = async (pilot: ExistingPilot) => {
    setIsLoading(true)
    try {
      const response = await fetch('/api/club/admin/assign_pilot', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          pilotId: pilot.id,
          role: 'USER'
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to assign pilot')
      }

      const data = await response.json()

      hotToast.success(`${pilot.firstname} ${pilot.lastname} er blevet tilføjet til klubben`)

      onAdd(data.clubPilot)
      handleClose()
    } catch (error: any) {
      console.error('Error assigning pilot:', error)
      hotToast.error(error.message || "Kunne ikke tilføje pilot til klubben")
    } finally {
      setIsLoading(false)
    }
  }

  const handleCreateNewPilot = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!formData.firstname || !formData.lastname) {
      hotToast.error("Fornavn og efternavn er påkrævet")
      return
    }

    setIsLoading(true)
    try {
      const response = await fetch('/api/club/admin/create_pilot', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          firstname: formData.firstname,
          lastname: formData.lastname,
          email: formData.email || null,
          phone: formData.phone || null,
          dsvu_id: formData.dsvu_id || null,
          status: formData.status,
          membership: formData.membership,
          role: formData.role,
          personal_pin: formData.personal_pin || null
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to create pilot')
      }

      const data = await response.json()

      hotToast.success(`${formData.firstname} ${formData.lastname} er blevet oprettet og tilføjet til klubben`)

      onAdd(data.clubPilot)
      handleClose()
    } catch (error: any) {
      console.error('Error creating pilot:', error)
      hotToast.error(error.message || "Kunne ikke oprette pilot")
    } finally {
      setIsLoading(false)
    }
  }

  const handleClose = () => {
    setStep('search')
    setSearchQuery('')
    setSearchResults([])
    setHasSearched(false)
    setFormData({
      firstname: '',
      lastname: '',
      email: '',
      phone: '',
      dsvu_id: '',
      status: 'ACTIVE',
      membership: 'A',
      role: 'USER',
      personal_pin: ''
    })
    onClose()
  }

  const handleCreateNewFromSearch = () => {
    // Pre-fill form with search query if it looks like "firstname lastname"
    const parts = searchQuery.trim().split(' ')
    if (parts.length >= 2) {
      setFormData(prev => ({
        ...prev,
        firstname: parts[0],
        lastname: parts.slice(1).join(' ')
      }))
    }
    setStep('create')
  }

  const handleInputChange = (field: string, value: string) => {
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
            <UserPlus className="h-5 w-5 mr-2" />
            {step === 'search' ? 'Søg Efter Pilot' : 'Opret Ny Pilot'}
          </SheetTitle>
          <SheetDescription>
            {step === 'search' 
              ? 'Søg efter eksisterende piloter eller opret en ny pilot.'
              : 'Udfyld informationer for den nye pilot.'
            }
          </SheetDescription>
        </SheetHeader>

        {step === 'search' ? (
          <div className="space-y-6 mt-6">
            {/* Search Form */}
            <form onSubmit={handleSearch} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="search">Søg efter navn</Label>
                <div className="flex space-x-2">
                  <Input
                    id="search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Skriv fornavn og efternavn..."
                    className="flex-1"
                  />
                  <Button type="submit" disabled={isLoading}>
                    <Search className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </form>

            {/* Search Results */}
            {hasSearched && (
              <div className="space-y-4">
                <h3 className="text-lg font-medium">Søgeresultater</h3>
                {searchResults.length > 0 ? (
                  <div className="space-y-2">
                    {searchResults.map((pilot) => (
                      <div key={pilot.id} className="flex items-center justify-between p-3 border rounded-lg">
                        <div>
                          <p className="font-medium">{pilot.firstname} {pilot.lastname}</p>
                          <p className="text-sm text-muted-foreground">
                            {pilot.email && !pilot.email.includes('@placeholder.local') ? pilot.email : 'Ingen email'} 
                            {pilot.dsvu_id && ` • DSVU: ${pilot.dsvu_id}`}
                          </p>
                        </div>
                        <Button 
                          size="sm" 
                          onClick={() => handleAssignExistingPilot(pilot)}
                          disabled={isLoading}
                        >
                          <Plus className="h-4 w-4 mr-1" />
                          Tilføj
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-4">
                    <p className="text-muted-foreground">Ingen piloter fundet</p>
                  </div>
                )}

                {/* Create New Button */}
                <div className="pt-4 border-t">
                  <Button 
                    onClick={handleCreateNewFromSearch}
                    variant="outline" 
                    className="w-full"
                  >
                    <UserPlus className="h-4 w-4 mr-2" />
                    Opret ny pilot i stedet
                  </Button>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex justify-end space-x-2 pt-4">
              <Button type="button" variant="outline" onClick={handleClose}>
                <X className="h-4 w-4 mr-2" />
                Annuller
              </Button>
              {!hasSearched && (
                <Button onClick={handleCreateNewFromSearch} variant="default">
                  <UserPlus className="h-4 w-4 mr-2" />
                  Spring søgning over
                </Button>
              )}
            </div>
          </div>
        ) : (
          <form onSubmit={handleCreateNewPilot} className="space-y-6 mt-6">
          {/* Basic Information */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium">Grundlæggende oplysninger</h3>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="firstname">Fornavn *</Label>
                <Input
                  id="firstname"
                  value={formData.firstname}
                  onChange={(e) => handleInputChange('firstname', e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastname">Efternavn *</Label>
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
                <Select value={formData.membership} onValueChange={(value: 'A' | 'B' | 'C') => handleInputChange('membership', value)}>
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

            <div className="space-y-2">
              <Label htmlFor="role">Rolle i klubben</Label>
              <Select value={formData.role} onValueChange={(value: 'ADMIN' | 'USER') => handleInputChange('role', value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="USER">Medlem</SelectItem>
                  <SelectItem value="ADMIN">Administrator</SelectItem>
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
                placeholder="Valgfrit - kun for admins"
                maxLength={4}
              />
              <p className="text-xs text-muted-foreground">
                Kun nødvendigt hvis piloten skal have admin adgang.
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col gap-4 pt-6 border-t">
            <div className="flex justify-start">
              <Button type="button" variant="ghost" onClick={() => setStep('search')} className="text-muted-foreground hover:text-foreground">
                <ArrowRight className="h-4 w-4 mr-2 rotate-180" />
                Tilbage til søgning
              </Button>
            </div>
            <div className="flex justify-end gap-3">
              <Button type="button" variant="outline" onClick={handleClose} disabled={isLoading}>
                <X className="h-4 w-4 mr-2" />
                Annuller
              </Button>
              <Button type="submit" disabled={isLoading}>
                <Save className="h-4 w-4 mr-2" />
                {isLoading ? "Opretter..." : "Opret Pilot"}
              </Button>
            </div>
          </div>
        </form>
        )}
      </SheetContent>
    </Sheet>
  )
}