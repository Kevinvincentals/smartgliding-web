'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Loader2, Plus, Trash2, Search, ChevronLeft, ChevronRight } from "lucide-react"
import { toast } from "sonner"

interface Plane {
  registration_id: string
  type: string
  is_twoseater: boolean
  flarm_id?: string
  competition_id?: string
  year_produced?: number
  notes?: string
}

interface PlaneApiResponse {
  success: boolean
  error?: string
  plane?: {
    registration_id: string
    type: string
    flarm_id?: string
    competition_id?: string
    is_twoseater?: boolean
  }
  suggestions?: Array<{
    registration_id: string
    type: string
    flarm_id?: string
    competition_id?: string
  }>
}

export default function InstallPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [installing, setInstalling] = useState(false)
  const [needsInstall, setNeedsInstall] = useState(false)
  const [lookupLoading, setLookupLoading] = useState<{ [key: number]: boolean }>({})
  const [currentStep, setCurrentStep] = useState(1)
  const totalSteps = 3

  // Form states
  const [clubData, setClubData] = useState({
    name: '',
    street: '',
    zip: '',
    city: '',
    country: 'Denmark',
    website: '',
    email: '',
    contactName: '',
    contactPhone: '',
    club_pin: '',
    homefield: ''
  })

  const [pilotData, setPilotData] = useState({
    firstname: '',
    lastname: '',
    email: '',
    password: '',
    phone: ''
  })

  const [planes, setPlanes] = useState<Plane[]>([
    {
      registration_id: '',
      type: '',
      is_twoseater: false
    }
  ])

  // Check if installation is needed
  useEffect(() => {
    checkInstallationStatus()
  }, [])

  const checkInstallationStatus = async () => {
    try {
      const response = await fetch('/api/install')
      const data = await response.json()
      
      if (data.success && !data.needsInstall) {
        // Installation not needed, redirect to home
        router.push('/')
        return
      }
      
      setNeedsInstall(data.needsInstall)
    } catch (error) {
      console.error('Error checking installation status:', error)
      toast.error('Failed to check installation status')
    } finally {
      setLoading(false)
    }
  }

  // Validation functions for each step
  const validateStep1 = () => {
    if (!clubData.name || !clubData.street || !clubData.zip || !clubData.city || !clubData.homefield) {
      toast.error('Udfyld venligst alle påkrævede klubfelter inklusiv hjemmebane ICAO')
      return false
    }
    return true
  }

  const validateStep2 = () => {
    if (!pilotData.firstname || !pilotData.lastname || !pilotData.email || !pilotData.password) {
      toast.error('Udfyld venligst alle påkrævede pilotfelter')
      return false
    }
    return true
  }

  const validateStep3 = () => {
    const validPlanes = planes.filter(plane => plane.registration_id && plane.type)
    if (validPlanes.length === 0) {
      toast.error('Tilføj venligst mindst ét fly med registrering og type')
      return false
    }
    return true
  }

  const nextStep = () => {
    let isValid = false
    
    switch (currentStep) {
      case 1:
        isValid = validateStep1()
        break
      case 2:
        isValid = validateStep2()
        break
      case 3:
        isValid = validateStep3()
        break
      default:
        isValid = true
    }
    
    if (isValid && currentStep < totalSteps) {
      setCurrentStep(currentStep + 1)
    }
  }

  const prevStep = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1)
    }
  }

  // Debounced plane lookup function
  const lookupPlane = useCallback(
    async (query: string, planeIndex: number) => {
      if (!query || query.length < 2) return

      setLookupLoading(prev => ({ ...prev, [planeIndex]: true }))

      try {
        const response = await fetch(`/api/install/lookup-plane?query=${encodeURIComponent(query)}`)
        const data: PlaneApiResponse = await response.json()

        if (data.success && data.plane) {
          // Prefill the plane data
          const updatedPlanes = [...planes]
          updatedPlanes[planeIndex] = {
            ...updatedPlanes[planeIndex],
            registration_id: data.plane.registration_id,
            type: data.plane.type,
            flarm_id: data.plane.flarm_id || '',
            competition_id: data.plane.competition_id || '',
            is_twoseater: data.plane.is_twoseater || false
          }
          setPlanes(updatedPlanes)
          toast.success(`Fundet fly: ${data.plane.type}`)
        } else if (data.success && data.suggestions && data.suggestions.length > 0) {
          toast.info(`Fundet ${data.suggestions.length} lignende fly`)
        } else {
          toast.info('Intet fly fundet - indtast manuelt')
        }
      } catch (error) {
        console.error('Error looking up plane:', error)
        toast.error('Fejl ved opslag af fly')
      } finally {
        setLookupLoading(prev => ({ ...prev, [planeIndex]: false }))
      }
    },
    [planes]
  )

  const addPlane = () => {
    setPlanes([...planes, {
      registration_id: '',
      type: '',
      is_twoseater: false
    }])
  }

  const removePlane = (index: number) => {
    if (planes.length > 1) {
      setPlanes(planes.filter((_, i) => i !== index))
    }
  }

  const updatePlane = (index: number, field: keyof Plane, value: any) => {
    const updatedPlanes = [...planes]
    updatedPlanes[index] = { ...updatedPlanes[index], [field]: value }
    setPlanes(updatedPlanes)
  }

  const handlePlaneLookup = (index: number) => {
    const plane = planes[index]
    if (plane.registration_id) {
      lookupPlane(plane.registration_id, index)
    }
  }

  const handleInstall = async () => {
    setInstalling(true)

    try {
      // Final validation
      if (!validateStep1() || !validateStep2() || !validateStep3()) {
        return
      }

      const validPlanes = planes.filter(plane => plane.registration_id && plane.type)

      const response = await fetch('/api/install', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          club: clubData,
          pilot: pilotData,
          planes: validPlanes
        })
      })

      const data = await response.json()

      if (data.success) {
        toast.success('Installation gennemført succesfuldt!')
        router.push('/')
      } else {
        toast.error(data.error || 'Installation fejlede')
      }
    } catch (error) {
      console.error('Installation error:', error)
      toast.error('Installation fejlede')
    } finally {
      setInstalling(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    )
  }

  if (!needsInstall) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Installation ikke nødvendig</h1>
          <p className="text-muted-foreground mt-2">Omdirigerer...</p>
        </div>
      </div>
    )
  }

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return (
          <Card>
            <CardHeader>
              <CardTitle>Trin 1: Klub Information</CardTitle>
              <CardDescription>
                Grundlæggende information om din flyveklub
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="club-name">Klub Navn *</Label>
                  <Input
                    id="club-name"
                    value={clubData.name}
                    onChange={(e) => setClubData({...clubData, name: e.target.value})}
                    placeholder="Navn på flyveklub"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="club-email">Email</Label>
                  <Input
                    id="club-email"
                    type="email"
                    value={clubData.email}
                    onChange={(e) => setClubData({...clubData, email: e.target.value})}
                    placeholder="klub@example.com"
                  />
                </div>
                <div>
                  <Label htmlFor="club-street">Adresse *</Label>
                  <Input
                    id="club-street"
                    value={clubData.street}
                    onChange={(e) => setClubData({...clubData, street: e.target.value})}
                    placeholder="Vej og husnummer"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="club-zip">Postnummer *</Label>
                  <Input
                    id="club-zip"
                    value={clubData.zip}
                    onChange={(e) => setClubData({...clubData, zip: e.target.value})}
                    placeholder="0000"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="club-city">By *</Label>
                  <Input
                    id="club-city"
                    value={clubData.city}
                    onChange={(e) => setClubData({...clubData, city: e.target.value})}
                    placeholder="By navn"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="club-country">Land</Label>
                  <Input
                    id="club-country"
                    value={clubData.country}
                    onChange={(e) => setClubData({...clubData, country: e.target.value})}
                    placeholder="Danmark"
                  />
                </div>
                <div>
                  <Label htmlFor="club-website">Hjemmeside</Label>
                  <Input
                    id="club-website"
                    value={clubData.website}
                    onChange={(e) => setClubData({...clubData, website: e.target.value})}
                    placeholder="https://example.com"
                  />
                </div>
                <div>
                  <Label htmlFor="club-phone">Telefon</Label>
                  <Input
                    id="club-phone"
                    value={clubData.contactPhone}
                    onChange={(e) => setClubData({...clubData, contactPhone: e.target.value})}
                    placeholder="+45 12 34 56 78"
                  />
                </div>
                <div>
                  <Label htmlFor="club-pin">Klub PIN (4 cifre)</Label>
                  <Input
                    id="club-pin"
                    type="text"
                    value={clubData.club_pin}
                    onChange={(e) => {
                      const value = e.target.value.replace(/\D/g, '').slice(0, 4)
                      setClubData({...clubData, club_pin: value})
                    }}
                    placeholder="1234"
                    maxLength={4}
                    pattern="\d{4}"
                  />
                </div>
                <div>
                  <Label htmlFor="club-homefield">Hjemmebane ICAO *</Label>
                  <Input
                    id="club-homefield"
                    value={clubData.homefield}
                    onChange={(e) => setClubData({...clubData, homefield: e.target.value.toUpperCase()})}
                    placeholder="EKFS"
                    maxLength={4}
                    style={{ textTransform: 'uppercase' }}
                  />
                  <p className="text-sm text-gray-500 mt-1">
                    4-bogstavs ICAO kode for klubbens hjemmebane (f.eks. EKFS)
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )

      case 2:
        return (
          <Card>
            <CardHeader>
              <CardTitle>Trin 2: Administrator Pilot</CardTitle>
              <CardDescription>
                Opret den første pilot som vil være administrator
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="pilot-firstname">Fornavn *</Label>
                  <Input
                    id="pilot-firstname"
                    value={pilotData.firstname}
                    onChange={(e) => setPilotData({...pilotData, firstname: e.target.value})}
                    placeholder="Fornavn"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="pilot-lastname">Efternavn *</Label>
                  <Input
                    id="pilot-lastname"
                    value={pilotData.lastname}
                    onChange={(e) => setPilotData({...pilotData, lastname: e.target.value})}
                    placeholder="Efternavn"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="pilot-email">Email *</Label>
                  <Input
                    id="pilot-email"
                    type="email"
                    value={pilotData.email}
                    onChange={(e) => setPilotData({...pilotData, email: e.target.value})}
                    placeholder="pilot@example.com"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="pilot-password">Adgangskode *</Label>
                  <Input
                    id="pilot-password"
                    type="password"
                    value={pilotData.password}
                    onChange={(e) => setPilotData({...pilotData, password: e.target.value})}
                    placeholder="Sikker adgangskode"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="pilot-phone">Telefon</Label>
                  <Input
                    id="pilot-phone"
                    value={pilotData.phone}
                    onChange={(e) => setPilotData({...pilotData, phone: e.target.value})}
                    placeholder="+45 12 34 56 78"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        )

      case 3:
        return (
          <Card>
            <CardHeader>
              <CardTitle>Trin 3: Fly Opsætning</CardTitle>
              <CardDescription>
                Tilføj flyene som klubben har. Indtast registrering og klik søg for at hente data automatisk.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {planes.map((plane, index) => (
                <div key={index} className="border rounded-lg p-4">
                  <div className="flex justify-between items-center mb-4">
                    <h4 className="font-medium">Fly #{index + 1}</h4>
                    {planes.length > 1 && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => removePlane(index)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div className="md:col-span-2 lg:col-span-1">
                      <Label htmlFor={`plane-reg-${index}`}>Registrering *</Label>
                      <div className="flex gap-2">
                        <Input
                          id={`plane-reg-${index}`}
                          value={plane.registration_id}
                          onChange={(e) => updatePlane(index, 'registration_id', e.target.value)}
                          placeholder="OY-ABC"
                          required
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => handlePlaneLookup(index)}
                          disabled={!plane.registration_id || lookupLoading[index]}
                        >
                          {lookupLoading[index] ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Search className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </div>
                    <div>
                      <Label htmlFor={`plane-type-${index}`}>Type *</Label>
                      <Input
                        id={`plane-type-${index}`}
                        value={plane.type}
                        onChange={(e) => updatePlane(index, 'type', e.target.value)}
                        placeholder="ASK 21"
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor={`plane-flarm-${index}`}>FLARM ID</Label>
                      <Input
                        id={`plane-flarm-${index}`}
                        value={plane.flarm_id || ''}
                        onChange={(e) => updatePlane(index, 'flarm_id', e.target.value)}
                        placeholder="123456"
                      />
                    </div>
                    <div>
                      <Label htmlFor={`plane-comp-${index}`}>Konkurrence ID</Label>
                      <Input
                        id={`plane-comp-${index}`}
                        value={plane.competition_id || ''}
                        onChange={(e) => updatePlane(index, 'competition_id', e.target.value)}
                        placeholder="ABC"
                      />
                    </div>
                    <div>
                      <Label htmlFor={`plane-year-${index}`}>Årgang</Label>
                      <Input
                        id={`plane-year-${index}`}
                        type="number"
                        value={plane.year_produced || ''}
                        onChange={(e) => updatePlane(index, 'year_produced', parseInt(e.target.value) || undefined)}
                        placeholder="2000"
                      />
                    </div>
                    <div className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        id={`plane-twoseater-${index}`}
                        checked={plane.is_twoseater}
                        onChange={(e) => updatePlane(index, 'is_twoseater', e.target.checked)}
                      />
                      <Label htmlFor={`plane-twoseater-${index}`}>To-sædet</Label>
                    </div>
                  </div>
                  
                  <div className="mt-4">
                    <Label htmlFor={`plane-notes-${index}`}>Noter</Label>
                    <Input
                      id={`plane-notes-${index}`}
                      value={plane.notes || ''}
                      onChange={(e) => updatePlane(index, 'notes', e.target.value)}
                      placeholder="Ekstra information..."
                    />
                  </div>
                </div>
              ))}
              
              <Button type="button" variant="outline" onClick={addPlane}>
                <Plus className="h-4 w-4 mr-2" />
                Tilføj Fly
              </Button>
            </CardContent>
          </Card>
        )

      default:
        return null
    }
  }

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="mx-auto max-w-4xl">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold">Velkommen til FSK System</h1>
          <p className="text-muted-foreground mt-2">
            Lad os opsætte dit system med klub, pilot og fly
          </p>
        </div>

        {/* Progress Indicator */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            {[1, 2, 3].map((step) => (
              <div key={step} className="flex items-center">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-medium ${
                  step === currentStep 
                    ? 'bg-primary text-primary-foreground' 
                    : step < currentStep 
                      ? 'bg-primary/20 text-primary' 
                      : 'bg-muted text-muted-foreground'
                }`}>
                  {step}
                </div>
                {step < 3 && (
                  <div className={`h-0.5 w-20 mx-2 ${
                    step < currentStep ? 'bg-primary' : 'bg-muted'
                  }`} />
                )}
              </div>
            ))}
          </div>
          <div className="text-center text-sm text-muted-foreground">
            Trin {currentStep} af {totalSteps}
          </div>
        </div>

        {/* Step Content */}
        <div className="mb-8">
          {renderStep()}
        </div>

        {/* Navigation */}
        <div className="flex justify-between">
          <Button 
            variant="outline" 
            onClick={prevStep} 
            disabled={currentStep === 1}
            className="flex items-center gap-2"
          >
            <ChevronLeft className="h-4 w-4" />
            Forrige
          </Button>
          
          {currentStep < totalSteps ? (
            <Button 
              onClick={nextStep}
              className="flex items-center gap-2"
            >
              Næste
              <ChevronRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button 
              onClick={handleInstall}
              disabled={installing}
              className="flex items-center gap-2"
            >
              {installing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {installing ? 'Installerer...' : 'Fuldfør Installation'}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
} 