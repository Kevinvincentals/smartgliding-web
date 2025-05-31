'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Loader2, Plus, Trash2, Search, ChevronLeft, ChevronRight, CheckCircle, Plane } from "lucide-react"
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
  const [isTransitioning, setIsTransitioning] = useState(false)
  const totalSteps = 3

  // Form states
  const [clubData, setClubData] = useState({
    name: '',
    street: '',
    zip: '',
    city: '',
    country: 'Danmark',
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
        router.push('/')
        return
      }
      
      setNeedsInstall(data.needsInstall)
    } catch (error) {
      console.error('Error checking installation status:', error)
      toast.error('Kunne ikke kontrollere installationsstatus')
    } finally {
      setLoading(false)
    }
  }

  // Validation functions for each step
  const validateStep1 = () => {
    if (!clubData.name || !clubData.street || !clubData.zip || !clubData.city || !clubData.homefield) {
      toast.error('Udfyld venligst alle påkrævede kluboplysninger, inklusive hjemmebane ICAO-kode')
      return false
    }
    return true
  }

  const validateStep2 = () => {
    if (!pilotData.firstname || !pilotData.lastname || !pilotData.email || !pilotData.password) {
      toast.error('Udfyld venligst alle påkrævede pilotoplysninger')
      return false
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(pilotData.email)) {
      toast.error('Indtast venligst en gyldig e-mailadresse')
      return false
    }
    if (pilotData.password.length < 6) {
      toast.error('Adgangskoden skal være mindst 6 tegn lang')
      return false
    }
    return true
  }

  const validateStep3 = () => {
    const validPlanes = planes.filter(plane => plane.registration_id && plane.type)
    if (validPlanes.length === 0) {
      toast.error('Tilføj venligst mindst ét fly med registrering og flytype')
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
      setIsTransitioning(true)
      setTimeout(() => {
        setCurrentStep(currentStep + 1)
        setIsTransitioning(false)
      }, 150)
    }
  }

  const prevStep = () => {
    if (currentStep > 1) {
      setIsTransitioning(true)
      setTimeout(() => {
        setCurrentStep(currentStep - 1)
        setIsTransitioning(false)
      }, 150)
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
          toast.success(`Fly fundet: ${data.plane.type}`)
        } else if (data.success && data.suggestions && data.suggestions.length > 0) {
          toast.info(`Fandt ${data.suggestions.length} lignende fly`)
        } else {
          toast.info('Ingen fly fundet - indtast oplysningerne manuelt')
        }
      } catch (error) {
        console.error('Error looking up plane:', error)
        toast.error('Kunne ikke slå fly op')
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
        toast.success('SmartGliding er nu installeret og klar til brug!')
        router.push('/')
      } else {
        toast.error(data.error || 'Installation mislykkedes')
      }
    } catch (error) {
      console.error('Installation error:', error)
      toast.error('Installation mislykkedes')
    } finally {
      setInstalling(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-lg text-gray-600">Starter SmartGliding...</p>
        </div>
      </div>
    )
  }

  if (!needsInstall) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
        <div className="text-center">
          <CheckCircle className="h-16 w-16 text-green-600 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900">SmartGliding er allerede installeret</h1>
          <p className="text-gray-600 mt-2">Omdirigerer til hovedsiden...</p>
        </div>
      </div>
    )
  }

  const stepTitles = [
    "Kluboplysninger",
    "Administrator",
    "Flyinformation"
  ]

  const stepDescriptions = [
    "Grundlæggende oplysninger om din svæveflyveklub",
    "Opret den første bruger som administrator",
    "Registrer klubbens svævefly"
  ]

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className={`transition-all duration-300 ${isTransitioning ? 'opacity-0 translate-x-4' : 'opacity-100 translate-x-0'}`}>
            <Card className="border-0 shadow-lg">
              <CardHeader className="pb-8">
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 bg-blue-100 rounded-lg">
                    <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                    </svg>
                  </div>
                  <CardTitle className="text-2xl text-gray-900">Kluboplysninger</CardTitle>
                </div>
                <CardDescription className="text-lg text-gray-600">
                  Fortæl os om din svæveflyveklub, så vi kan tilpasse systemet
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="md:col-span-2">
                    <Label htmlFor="club-name" className="text-base font-medium text-gray-700">Klubnavn *</Label>
                    <Input
                      id="club-name"
                      value={clubData.name}
                      onChange={(e) => setClubData({...clubData, name: e.target.value})}
                      placeholder="f.eks. Københavns Svæveflyveklub"
                      className="mt-2 h-12 text-base"
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="club-street" className="text-base font-medium text-gray-700">Adresse *</Label>
                    <Input
                      id="club-street"
                      value={clubData.street}
                      onChange={(e) => setClubData({...clubData, street: e.target.value})}
                      placeholder="Vej og husnummer"
                      className="mt-2 h-12 text-base"
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="club-zip" className="text-base font-medium text-gray-700">Postnummer *</Label>
                    <Input
                      id="club-zip"
                      value={clubData.zip}
                      onChange={(e) => setClubData({...clubData, zip: e.target.value})}
                      placeholder="2000"
                      className="mt-2 h-12 text-base"
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="club-city" className="text-base font-medium text-gray-700">By *</Label>
                    <Input
                      id="club-city"
                      value={clubData.city}
                      onChange={(e) => setClubData({...clubData, city: e.target.value})}
                      placeholder="København"
                      className="mt-2 h-12 text-base"
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="club-country" className="text-base font-medium text-gray-700">Land</Label>
                    <Input
                      id="club-country"
                      value={clubData.country}
                      onChange={(e) => setClubData({...clubData, country: e.target.value})}
                      placeholder="Danmark"
                      className="mt-2 h-12 text-base"
                    />
                  </div>
                  <div>
                    <Label htmlFor="club-homefield" className="text-base font-medium text-gray-700">Hjemmebane ICAO-kode *</Label>
                    <Input
                      id="club-homefield"
                      value={clubData.homefield}
                      onChange={(e) => setClubData({...clubData, homefield: e.target.value.toUpperCase()})}
                      placeholder="EKFS"
                      maxLength={4}
                      className="mt-2 h-12 text-base font-mono"
                      style={{ textTransform: 'uppercase' }}
                    />
                    <p className="text-sm text-gray-500 mt-2">
                      4-bogstavs ICAO-kode for hjemmeflyvepladsen (f.eks. EKFS for Frederiksund)
                    </p>
                  </div>
                  <div>
                    <Label htmlFor="club-email" className="text-base font-medium text-gray-700">E-mailadresse</Label>
                    <Input
                      id="club-email"
                      type="email"
                      value={clubData.email}
                      onChange={(e) => setClubData({...clubData, email: e.target.value})}
                      placeholder="info@klubnavn.dk"
                      className="mt-2 h-12 text-base"
                    />
                  </div>
                  <div>
                    <Label htmlFor="club-website" className="text-base font-medium text-gray-700">Hjemmeside</Label>
                    <Input
                      id="club-website"
                      value={clubData.website}
                      onChange={(e) => setClubData({...clubData, website: e.target.value})}
                      placeholder="https://www.klubnavn.dk"
                      className="mt-2 h-12 text-base"
                    />
                  </div>
                  <div>
                    <Label htmlFor="club-phone" className="text-base font-medium text-gray-700">Telefonnummer</Label>
                    <Input
                      id="club-phone"
                      value={clubData.contactPhone}
                      onChange={(e) => setClubData({...clubData, contactPhone: e.target.value})}
                      placeholder="+45 12 34 56 78"
                      className="mt-2 h-12 text-base"
                    />
                  </div>
                  <div>
                    <Label htmlFor="club-pin" className="text-base font-medium text-gray-700">Klub PIN-kode (valgfri)</Label>
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
                      className="mt-2 h-12 text-base font-mono"
                      pattern="\d{4}"
                    />
                    <p className="text-sm text-gray-500 mt-2">
                      4-cifret kode til sikker adgang for klubmedlemmer
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )

      case 2:
        return (
          <div className={`transition-all duration-300 ${isTransitioning ? 'opacity-0 translate-x-4' : 'opacity-100 translate-x-0'}`}>
            <Card className="border-0 shadow-lg">
              <CardHeader className="pb-8">
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 bg-green-100 rounded-lg">
                    <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </div>
                  <CardTitle className="text-2xl text-gray-900">Administrator</CardTitle>
                </div>
                <CardDescription className="text-lg text-gray-600">
                  Opret den første bruger som vil være systemadministrator
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <Label htmlFor="pilot-firstname" className="text-base font-medium text-gray-700">Fornavn *</Label>
                    <Input
                      id="pilot-firstname"
                      value={pilotData.firstname}
                      onChange={(e) => setPilotData({...pilotData, firstname: e.target.value})}
                      placeholder="Anders"
                      className="mt-2 h-12 text-base"
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="pilot-lastname" className="text-base font-medium text-gray-700">Efternavn *</Label>
                    <Input
                      id="pilot-lastname"
                      value={pilotData.lastname}
                      onChange={(e) => setPilotData({...pilotData, lastname: e.target.value})}
                      placeholder="Nielsen"
                      className="mt-2 h-12 text-base"
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="pilot-email" className="text-base font-medium text-gray-700">E-mailadresse *</Label>
                    <Input
                      id="pilot-email"
                      type="email"
                      value={pilotData.email}
                      onChange={(e) => setPilotData({...pilotData, email: e.target.value})}
                      placeholder="anders@example.com"
                      className="mt-2 h-12 text-base"
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="pilot-password" className="text-base font-medium text-gray-700">Adgangskode *</Label>
                    <Input
                      id="pilot-password"
                      type="password"
                      value={pilotData.password}
                      onChange={(e) => setPilotData({...pilotData, password: e.target.value})}
                      placeholder="Mindst 6 tegn"
                      className="mt-2 h-12 text-base"
                      required
                    />
                  </div>
                  <div className="md:col-span-2">
                    <Label htmlFor="pilot-phone" className="text-base font-medium text-gray-700">Telefonnummer (valgfri)</Label>
                    <Input
                      id="pilot-phone"
                      value={pilotData.phone}
                      onChange={(e) => setPilotData({...pilotData, phone: e.target.value})}
                      placeholder="+45 12 34 56 78"
                      className="mt-2 h-12 text-base"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )

      case 3:
        return (
          <div className={`transition-all duration-300 ${isTransitioning ? 'opacity-0 translate-x-4' : 'opacity-100 translate-x-0'}`}>
            <Card className="border-0 shadow-lg">
              <CardHeader className="pb-8">
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 bg-purple-100 rounded-lg">
                    <Plane className="w-6 h-6 text-purple-600" />
                  </div>
                  <CardTitle className="text-2xl text-gray-900">Flyinformation</CardTitle>
                </div>
                <CardDescription className="text-lg text-gray-600">
                  Registrer klubbens svævefly. Indtast registrering og klik søg for at hente data automatisk.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {planes.map((plane, index) => (
                  <div key={index} className="border-2 border-gray-100 rounded-xl p-6 bg-gray-50/50">
                    <div className="flex justify-between items-center mb-6">
                      <h4 className="text-lg font-semibold text-gray-800">Fly #{index + 1}</h4>
                      {planes.length > 1 && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => removePlane(index)}
                          className="text-red-600 border-red-200 hover:bg-red-50"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      <div className="md:col-span-2 lg:col-span-1">
                        <Label htmlFor={`plane-reg-${index}`} className="text-base font-medium text-gray-700">Registrering *</Label>
                        <div className="flex gap-2 mt-2">
                          <Input
                            id={`plane-reg-${index}`}
                            value={plane.registration_id}
                            onChange={(e) => updatePlane(index, 'registration_id', e.target.value)}
                            placeholder="OY-ABC"
                            className="h-12 text-base font-mono"
                            required
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="lg"
                            onClick={() => handlePlaneLookup(index)}
                            disabled={!plane.registration_id || lookupLoading[index]}
                            className="px-4"
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
                        <Label htmlFor={`plane-type-${index}`} className="text-base font-medium text-gray-700">Flytype *</Label>
                        <Input
                          id={`plane-type-${index}`}
                          value={plane.type}
                          onChange={(e) => updatePlane(index, 'type', e.target.value)}
                          placeholder="ASK 21"
                          className="mt-2 h-12 text-base"
                          required
                        />
                      </div>
                      <div>
                        <Label htmlFor={`plane-flarm-${index}`} className="text-base font-medium text-gray-700">FLARM ID</Label>
                        <Input
                          id={`plane-flarm-${index}`}
                          value={plane.flarm_id || ''}
                          onChange={(e) => updatePlane(index, 'flarm_id', e.target.value)}
                          placeholder="123456"
                          className="mt-2 h-12 text-base font-mono"
                        />
                      </div>
                      <div>
                        <Label htmlFor={`plane-comp-${index}`} className="text-base font-medium text-gray-700">Konkurrence ID</Label>
                        <Input
                          id={`plane-comp-${index}`}
                          value={plane.competition_id || ''}
                          onChange={(e) => updatePlane(index, 'competition_id', e.target.value)}
                          placeholder="ABC"
                          className="mt-2 h-12 text-base font-mono"
                        />
                      </div>
                      <div>
                        <Label htmlFor={`plane-year-${index}`} className="text-base font-medium text-gray-700">Produktionsår</Label>
                        <Input
                          id={`plane-year-${index}`}
                          type="number"
                          value={plane.year_produced || ''}
                          onChange={(e) => updatePlane(index, 'year_produced', parseInt(e.target.value) || undefined)}
                          placeholder="2000"
                          className="mt-2 h-12 text-base"
                        />
                      </div>
                      <div className="flex items-center space-x-3 pt-8">
                        <input
                          type="checkbox"
                          id={`plane-twoseater-${index}`}
                          checked={plane.is_twoseater}
                          onChange={(e) => updatePlane(index, 'is_twoseater', e.target.checked)}
                          className="w-5 h-5 text-blue-600 rounded"
                        />
                        <Label htmlFor={`plane-twoseater-${index}`} className="text-base font-medium text-gray-700">To-sædet fly</Label>
                      </div>
                    </div>
                    
                    <div className="mt-6">
                      <Label htmlFor={`plane-notes-${index}`} className="text-base font-medium text-gray-700">Bemærkninger</Label>
                      <Input
                        id={`plane-notes-${index}`}
                        value={plane.notes || ''}
                        onChange={(e) => updatePlane(index, 'notes', e.target.value)}
                        placeholder="Ekstra information om flyet..."
                        className="mt-2 h-12 text-base"
                      />
                    </div>
                  </div>
                ))}
                
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={addPlane}
                  className="w-full h-12 text-base border-dashed border-2 border-gray-300 hover:border-blue-400 hover:bg-blue-50"
                >
                  <Plus className="h-5 w-5 mr-2" />
                  Tilføj nyt fly
                </Button>
              </CardContent>
            </Card>
          </div>
        )

      default:
        return null
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 p-4">
      <div className="mx-auto max-w-4xl">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="mb-6">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600 rounded-2xl mb-4">
              <Plane className="w-8 h-8 text-white" />
            </div>
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
            Velkommen til SmartGliding systemet
          </h1>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Lad os opsætte dit system på få minutter. Vi hjælper dig med at registrere klub, administrator og fly.
          </p>
        </div>

        {/* Enhanced Progress Indicator */}
        <div className="mb-12">
          <div className="flex items-center justify-between mb-6">
            {[1, 2, 3].map((step) => (
              <div key={step} className="flex items-center flex-1">
                <div className="flex flex-col items-center">
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center font-semibold text-lg transition-all duration-300 ${
                    step === currentStep 
                      ? 'bg-blue-600 text-white shadow-lg scale-110' 
                      : step < currentStep 
                        ? 'bg-green-500 text-white' 
                        : 'bg-gray-200 text-gray-500'
                  }`}>
                    {step < currentStep ? <CheckCircle className="w-6 h-6" /> : step}
                  </div>
                  <div className="mt-3 text-center">
                    <div className={`font-medium transition-colors duration-300 ${
                      step <= currentStep ? 'text-gray-900' : 'text-gray-500'
                    }`}>
                      {stepTitles[step - 1]}
                    </div>
                    <div className={`text-sm mt-1 transition-colors duration-300 ${
                      step <= currentStep ? 'text-gray-600' : 'text-gray-400'
                    }`}>
                      {stepDescriptions[step - 1]}
                    </div>
                  </div>
                </div>
                {step < 3 && (
                  <div className={`h-1 flex-1 mx-4 rounded-full transition-all duration-500 ${
                    step < currentStep ? 'bg-green-500' : 'bg-gray-200'
                  }`} />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Step Content */}
        <div className="mb-12">
          {renderStep()}
        </div>

        {/* Enhanced Navigation */}
        <div className="flex justify-between items-center">
          <Button 
            variant="outline" 
            onClick={prevStep} 
            disabled={currentStep === 1}
            className="flex items-center gap-2 h-12 px-6 text-base"
          >
            <ChevronLeft className="h-5 w-5" />
            Forrige
          </Button>
          
          <div className="text-center">
            <div className="text-sm text-gray-500">
              Trin {currentStep} af {totalSteps}
            </div>
          </div>
          
          {currentStep < totalSteps ? (
            <Button 
              onClick={nextStep}
              className="flex items-center gap-2 h-12 px-6 text-base bg-blue-600 hover:bg-blue-700"
            >
              Næste
              <ChevronRight className="h-5 w-5" />
            </Button>
          ) : (
            <Button 
              onClick={handleInstall}
              disabled={installing}
              className="flex items-center gap-2 h-12 px-8 text-base bg-green-600 hover:bg-green-700"
            >
              {installing && <Loader2 className="mr-2 h-5 w-5 animate-spin" />}
              {installing ? 'Installerer...' : 'Gennemfør installation'}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
} 