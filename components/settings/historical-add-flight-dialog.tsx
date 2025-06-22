"use client"

import { useState, useEffect } from "react"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Combobox } from "@/components/ui/combobox"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Plus, MapPin, X, Check, Plane, Users, GraduationCap, Clock } from "lucide-react"
import type { Aircraft, Pilot, AirfieldOption, LaunchMethod } from "@/types/flight"
import { useToast } from "@/components/ui/use-toast"
import { TimePickerDialog } from "@/components/time-picker-dialog"
import { format } from "date-fns"
import { da } from "date-fns/locale"

interface HistoricalAddFlightDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  selectedDate: Date
  airfieldOptions: AirfieldOption[]
  onFlightAdded: () => void
}

export function HistoricalAddFlightDialog({
  open,
  onOpenChange,
  selectedDate,
  airfieldOptions,
  onFlightAdded,
}: HistoricalAddFlightDialogProps) {
  const [newFlight, setNewFlight] = useState({
    aircraftId: "",
    customAircraft: "",
    pilotId: "",
    customPilot: "",
    coPilotId: "",
    customCoPilot: "",
    isSchoolFlight: false,
    startField: "", // Will be set after airfield options are fetched
    launchMethod: "S" as LaunchMethod,
    takeoffTime: "",
    landingTime: "",
  })
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [aircraftOptions, setAircraftOptions] = useState<Aircraft[]>([])
  const [pilotOptions, setPilotOptions] = useState<Pilot[]>([])
  const [isTimePickerOpen, setIsTimePickerOpen] = useState(false)
  const [timeEditType, setTimeEditType] = useState<"start" | "end">("start")
  const { toast } = useToast()

  // Fetch aircraft and pilot options
  useEffect(() => {
    const fetchOptions = async () => {
      try {
        // Fetch aircraft
        const planesResponse = await fetch('/api/tablet/fetch_planes')
        if (planesResponse.ok) {
          const planesData = await planesResponse.json()
          if (planesData.success && planesData.planes) {
            setAircraftOptions(planesData.planes)
          }
        }

        // Fetch pilots
        const pilotsResponse = await fetch('/api/tablet/fetch_pilots')
        if (pilotsResponse.ok) {
          const pilotsData = await pilotsResponse.json()
          if (pilotsData.success && pilotsData.pilots) {
            setPilotOptions(pilotsData.pilots)
          }
        }
      } catch (error) {
        console.error('Error fetching options:', error)
      }
    }

    if (open) {
      fetchOptions()
    }
  }, [open])

  // Set default startField when airfield options are available
  useEffect(() => {
    if (airfieldOptions.length > 0 && !newFlight.startField) {
      setNewFlight(prev => ({ 
        ...prev, 
        startField: airfieldOptions[0].id 
      }))
    }
  }, [airfieldOptions, newFlight.startField])

  const handleTimeClick = (type: "start" | "end") => {
    setTimeEditType(type)
    setIsTimePickerOpen(true)
  }

  const getCurrentTimeValue = (): string | null => {
    return timeEditType === "start" ? newFlight.takeoffTime : newFlight.landingTime
  }

  const handleTimeSelected = (time: string) => {
    if (timeEditType === "start") {
      setNewFlight(prev => ({ ...prev, takeoffTime: time }))
    } else {
      setNewFlight(prev => ({ ...prev, landingTime: time }))
    }
    setIsTimePickerOpen(false)
  }

  const handleSubmit = async () => {
    setIsLoading(true)
    setError(null)

    // Find selected aircraft
    let aircraft: Aircraft | null = null
    if (newFlight.aircraftId) {
      aircraft = aircraftOptions.find((a) => a.id.toString() === newFlight.aircraftId) || null
    } else if (newFlight.customAircraft) {
      aircraft = {
        id: 0,
        registration: newFlight.customAircraft,
        type: "Unknown",
        isDoubleSeater: true,
        hasFlarm: false,
      }
    }

    // Find selected pilot
    let pilot: Pilot | null = null
    if (newFlight.pilotId) {
      pilot = pilotOptions.find((p) => p.id.toString() === newFlight.pilotId) || null
    } else if (newFlight.customPilot) {
      pilot = {
        id: "guest",
        name: newFlight.customPilot,
      }
    }

    // Find selected co-pilot
    let coPilot: Pilot | null = null
    if (aircraft?.isDoubleSeater) {
      if (newFlight.coPilotId) {
        coPilot = pilotOptions.find((p) => p.id.toString() === newFlight.coPilotId) || null
      } else if (newFlight.customCoPilot) {
        coPilot = {
          id: "guest",
          name: newFlight.customCoPilot,
        }
      }
    }

    // Validate required fields
    if (!aircraft) {
      setError('Please select or enter an aircraft')
      setIsLoading(false)
      return
    }

    if (!pilot) {
      setError('Please select or enter a pilot')
      setIsLoading(false)
      return
    }

    try {
      // Format the date in YYYY-MM-DD format
      const year = selectedDate.getFullYear()
      const month = String(selectedDate.getMonth() + 1).padStart(2, '0')
      const day = String(selectedDate.getDate()).padStart(2, '0')
      const formattedDate = `${year}-${month}-${day}`

      // Create payload for historical flight
      const payload = {
        date: formattedDate,
        aircraft: {
          id: aircraft.registration,
          registration: aircraft.registration,
          type: aircraft.type,
          isDoubleSeater: aircraft.isDoubleSeater,
          hasFlarm: aircraft.hasFlarm,
          flarmId: aircraft.flarmId,
        },
        pilot,
        coPilot,
        isSchoolFlight: newFlight.isSchoolFlight,
        startField: newFlight.startField,
        launchMethod: newFlight.launchMethod || 'S',
        takeoffTime: newFlight.takeoffTime || null,
        landingTime: newFlight.landingTime || null
      }

      const response = await fetch('/api/tablet/historical_add_flight', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })

      const data = await response.json()
      
      if (data.success) {
        toast({
          title: "Flyvning tilføjet",
          description: `Historisk flyvning tilføjet for ${format(selectedDate, 'dd. MMMM yyyy', { locale: da })}`,
          variant: "default",
        })
        
        // Reset form
        setNewFlight({
          aircraftId: "",
          customAircraft: "",
          pilotId: "",
          customPilot: "",
          coPilotId: "",
          customCoPilot: "",
          isSchoolFlight: false,
          startField: airfieldOptions.length > 0 ? airfieldOptions[0].id : "",
          launchMethod: "S" as LaunchMethod,
          takeoffTime: "",
          landingTime: "",
        })
        
        onOpenChange(false)
        onFlightAdded()
      } else {
        setError(data.error || "Der opstod en fejl ved tilføjelse af flyvningen")
      }
    } catch (error) {
      setError("Der opstod en uventet fejl")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>
            Tilføj historisk flyvning for {format(selectedDate, 'dd. MMMM yyyy', { locale: da })}
          </DialogTitle>
        </DialogHeader>
        
        <div className="grid gap-4 py-4">
          {error && (
            <div className="text-red-600 text-sm bg-red-50 p-2 rounded">{error}</div>
          )}
          
          {/* Aircraft Selection */}
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="aircraft" className="text-right">Fly</Label>
            <div className="col-span-3">
              <Combobox
                items={aircraftOptions.map(a => ({
                  label: `${a.registration} (${a.type})`,
                  value: a.id.toString()
                }))}
                value={newFlight.aircraftId}
                onChange={(value) => setNewFlight({ ...newFlight, aircraftId: value })}
                onTextChange={(text) => setNewFlight({ 
                  ...newFlight, 
                  customAircraft: text,
                  aircraftId: "" 
                })}
                placeholder="Vælg eller indtast flyregistrering"
                initialSearchMode={true}
                tallDropdown={true}
              />
            </div>
          </div>

          {/* Pilot Selection */}
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="pilot" className="text-right">Pilot</Label>
            <div className="col-span-3">
              <Combobox
                items={pilotOptions.map(p => ({
                  label: p.name,
                  value: p.id.toString()
                }))}
                value={newFlight.pilotId}
                onChange={(value) => setNewFlight({ ...newFlight, pilotId: value })}
                onTextChange={(text) => setNewFlight({ 
                  ...newFlight, 
                  customPilot: text,
                  pilotId: "" 
                })}
                placeholder="Vælg klub-pilot eller indtast gæst navn"
                initialSearchMode={true}
                tallDropdown={true}
                customButtonText='Tilføj "{value}" som gæstepilot'
              />
            </div>
          </div>

          {/* Co-pilot Selection (for double seaters) */}
          {(aircraftOptions.find(a => a.id.toString() === newFlight.aircraftId)?.isDoubleSeater || newFlight.customAircraft) && (
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="copilot" className="text-right">Bagsæde/Instruktør</Label>
              <div className="col-span-3">
                <Combobox
                  items={pilotOptions.map(p => ({
                    label: p.name,
                    value: p.id.toString()
                  }))}
                  value={newFlight.coPilotId}
                  onChange={(value) => setNewFlight({ ...newFlight, coPilotId: value })}
                  onTextChange={(text) => setNewFlight({ 
                    ...newFlight, 
                    customCoPilot: text,
                    coPilotId: "" 
                  })}
                  placeholder="Vælg klub-pilot eller indtast gæst navn"
                  initialSearchMode={true}
                  tallDropdown={true}
                  customButtonText='Tilføj "{value}" som gæstepilot'
                />
              </div>
            </div>
          )}

          {/* School Flight Checkbox */}
          <div className="grid grid-cols-4 items-center gap-4">
            <Label className="text-right">Skoleflyvning</Label>
            <div className="col-span-3">
              <Checkbox
                checked={newFlight.isSchoolFlight}
                onCheckedChange={(checked) => 
                  setNewFlight({ ...newFlight, isSchoolFlight: !!checked })
                }
              />
            </div>
          </div>

          {/* Start Field */}
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="startField" className="text-right">Startplads</Label>
            <div className="col-span-3">
              <Select
                value={newFlight.startField}
                onValueChange={(value) => setNewFlight({ ...newFlight, startField: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Vælg startplads" />
                </SelectTrigger>
                <SelectContent>
                  {airfieldOptions.map((field) => (
                    <SelectItem key={field.id} value={field.id}>
                      {field.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Launch Method */}
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="launchMethod" className="text-right">Startmetode</Label>
            <div className="col-span-3">
              <Select
                value={newFlight.launchMethod}
                onValueChange={(value: LaunchMethod) => 
                  setNewFlight({ ...newFlight, launchMethod: value })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="S">Spilstart (S)</SelectItem>
                  <SelectItem value="M">Selvstart (M)</SelectItem>
                  <SelectItem value="F">Flyslæb (F)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Takeoff Time */}
          <div className="grid grid-cols-4 items-center gap-4">
            <Label className="text-right">
              <Clock className="inline w-4 h-4 mr-1" />
              Start tid
            </Label>
            <div className="col-span-3">
              <Button
                type="button"
                variant="outline"
                className="w-full justify-start text-left font-normal"
                onClick={() => handleTimeClick("start")}
              >
                <Clock className="mr-2 h-4 w-4" />
                {newFlight.takeoffTime || "Vælg starttid"}
              </Button>
            </div>
          </div>

          {/* Landing Time */}
          <div className="grid grid-cols-4 items-center gap-4">
            <Label className="text-right">
              <Clock className="inline w-4 h-4 mr-1" />
              Landing tid
            </Label>
            <div className="col-span-3">
              <Button
                type="button"
                variant="outline"
                className="w-full justify-start text-left font-normal"
                onClick={() => handleTimeClick("end")}
              >
                <Clock className="mr-2 h-4 w-4" />
                {newFlight.landingTime || "Vælg landingstid"}
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annuller
          </Button>
          <Button onClick={handleSubmit} disabled={isLoading}>
            {isLoading ? "Tilføjer..." : "Tilføj flyvning"}
          </Button>
        </DialogFooter>
      </DialogContent>
      
      {/* Time Picker Dialog */}
      <TimePickerDialog
        open={isTimePickerOpen}
        onOpenChange={setIsTimePickerOpen}
        onTimeSelected={handleTimeSelected}
        type={timeEditType}
        currentValue={getCurrentTimeValue()}
      />
    </Dialog>
  )
}