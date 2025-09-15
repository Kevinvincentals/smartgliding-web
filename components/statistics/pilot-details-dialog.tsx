"use client"

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Plane, Clock, GraduationCap, User, Calendar, Timer } from "lucide-react"
import { format } from "date-fns"
import { da } from "date-fns/locale"

interface FlightDetails {
  id: string
  registration: string
  type: string
  pilot: string
  coPilot: string | null
  takeoffTime: string
  landingTime: string
  duration: string
  durationMinutes: number
  status: string
  isSchoolFlight: boolean
  date: string | null
}

interface PilotDetailsDialogProps {
  isOpen: boolean
  onClose: () => void
  pilotName: string
  pilotId: string
  flights: FlightDetails[]
  totalFlights: number
  totalTimeMinutes: number
  instructorFlights: number
  soloFlights: number
  studentFlights: number
}

export function PilotDetailsDialog({
  isOpen,
  onClose,
  pilotName,
  pilotId,
  flights,
  totalFlights,
  totalTimeMinutes,
  instructorFlights,
  soloFlights,
  studentFlights
}: PilotDetailsDialogProps) {
  // Group flights by aircraft
  const flightsByAircraft = flights.reduce((acc: any, flight) => {
    // Determine if this pilot was instructor or student/solo
    const isPilot1 = flight.pilot === pilotName
    const isPilot2 = flight.coPilot === pilotName
    
    let role: "instructor" | "solo" | "student" = "solo"
    if (flight.isSchoolFlight) {
      if (isPilot2) {
        role = "instructor"
      } else if (isPilot1) {
        role = "student"
      }
    }
    
    // Only count flights where this pilot was involved
    if (!isPilot1 && !isPilot2) return acc
    
    const key = flight.registration
    if (!acc[key]) {
      acc[key] = {
        registration: flight.registration,
        type: flight.type,
        flights: [],
        totalStarts: 0,
        totalMinutes: 0,
        instructorStarts: 0,
        instructorMinutes: 0,
        soloStarts: 0,
        soloMinutes: 0,
        studentStarts: 0,
        studentMinutes: 0
      }
    }
    
    acc[key].flights.push({ ...flight, role })
    acc[key].totalStarts++
    acc[key].totalMinutes += flight.durationMinutes
    
    if (role === "instructor") {
      acc[key].instructorStarts++
      acc[key].instructorMinutes += flight.durationMinutes
    } else if (role === "solo") {
      acc[key].soloStarts++
      acc[key].soloMinutes += flight.durationMinutes
    } else if (role === "student") {
      acc[key].studentStarts++
      acc[key].studentMinutes += flight.durationMinutes
    }
    
    return acc
  }, {})
  
  // Convert to array and sort by total starts
  const aircraftArray = Object.values(flightsByAircraft).sort((a: any, b: any) => 
    b.totalStarts - a.totalStarts
  )
  
  // Format time helper
  const formatMinutes = (minutes: number) => {
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    if (hours === 0) return `${mins} min`
    return `${hours}t ${mins}m`
  }
  
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold flex items-center gap-2">
            <User className="h-6 w-6" />
            {pilotName}
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6">
          {/* Summary Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="p-4 text-center">
              <div className="text-3xl font-bold text-blue-600">{totalFlights}</div>
              <div className="text-sm text-muted-foreground">Total starter</div>
            </Card>
            <Card className="p-4 text-center">
              <div className="text-3xl font-bold text-slate-700">
                {formatMinutes(totalTimeMinutes)}
              </div>
              <div className="text-sm text-muted-foreground">Total tid</div>
            </Card>
            <Card className="p-4 text-center">
              <div className="text-3xl font-bold text-emerald-600">{instructorFlights}</div>
              <div className="text-sm text-muted-foreground">Som instruktør</div>
            </Card>
            <Card className="p-4 text-center">
              <div className="text-3xl font-bold text-blue-600">{soloFlights}</div>
              <div className="text-sm text-muted-foreground">Alene</div>
            </Card>
          </div>
          
          {/* Aircraft Breakdown */}
          <div>
            <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <Plane className="h-5 w-5" />
              Flyvninger per fly
            </h3>
            
            <div className="space-y-3">
              {aircraftArray.map((aircraft: any) => (
                <Card key={aircraft.registration} className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="font-semibold text-lg flex items-center gap-2">
                        {aircraft.registration}
                        <Badge variant="outline" className="text-xs">
                          {aircraft.type}
                        </Badge>
                      </div>
                      <div className="text-sm text-muted-foreground mt-1">
                        {aircraft.totalStarts} {aircraft.totalStarts === 1 ? 'start' : 'starter'} • {formatMinutes(aircraft.totalMinutes)} total
                      </div>
                    </div>
                  </div>
                  
                  {/* Role breakdown */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
                    {aircraft.instructorStarts > 0 && (
                      <div className="flex items-center gap-2 p-2 bg-emerald-50 rounded-lg">
                        <GraduationCap className="h-4 w-4 text-emerald-600" />
                        <div>
                          <div className="font-medium text-emerald-700">
                            {aircraft.instructorStarts} som instruktør
                          </div>
                          <div className="text-xs text-emerald-600">
                            {formatMinutes(aircraft.instructorMinutes)}
                          </div>
                        </div>
                      </div>
                    )}
                    
                    {aircraft.soloStarts > 0 && (
                      <div className="flex items-center gap-2 p-2 bg-blue-50 rounded-lg">
                        <User className="h-4 w-4 text-blue-600" />
                        <div>
                          <div className="font-medium text-blue-700">
                            {aircraft.soloStarts} alene
                          </div>
                          <div className="text-xs text-blue-600">
                            {formatMinutes(aircraft.soloMinutes)}
                          </div>
                        </div>
                      </div>
                    )}
                    
                    {aircraft.studentStarts > 0 && (
                      <div className="flex items-center gap-2 p-2 bg-amber-50 rounded-lg">
                        <GraduationCap className="h-4 w-4 text-amber-600" />
                        <div>
                          <div className="font-medium text-amber-700">
                            {aircraft.studentStarts} som elev
                          </div>
                          <div className="text-xs text-amber-600">
                            {formatMinutes(aircraft.studentMinutes)}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                  
                  {/* Individual flights */}
                  <details className="group">
                    <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground transition-colors">
                      Vis individuelle flyvninger
                    </summary>
                    
                    <div className="mt-3 space-y-2">
                      {aircraft.flights.map((flight: any) => (
                        <div key={flight.id} className="flex items-center justify-between p-2 bg-slate-50 rounded">
                          <div className="flex items-center gap-3">
                            <Clock className="h-4 w-4 text-slate-500" />
                            <div>
                              <div className="text-sm font-medium">
                                {flight.takeoffTime} - {flight.landingTime}
                              </div>
                              {flight.date && (
                                <div className="text-xs text-muted-foreground">
                                  {format(new Date(flight.date), 'dd. MMM', { locale: da })}
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge 
                              variant={
                                flight.role === "instructor" ? "default" : 
                                flight.role === "solo" ? "secondary" : "outline"
                              }
                              className="text-xs"
                            >
                              {flight.role === "instructor" ? "Instruktør" :
                               flight.role === "solo" ? "Alene" : "Elev"}
                            </Badge>
                            <div className="text-sm font-medium">
                              {flight.duration}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </details>
                </Card>
              ))}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}