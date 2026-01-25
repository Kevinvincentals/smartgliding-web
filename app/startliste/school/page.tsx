"use client"

import { Suspense, useState, useEffect } from "react"
import { Loader2, WifiOff, User, SettingsIcon, GraduationCap, Clock, Plane, Users, CheckCircle2, BookOpen, Target, FileText, CalendarDays, Timer, UserCheck, Calendar as CalendarIcon } from "lucide-react"
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription } from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { ChevronDown, ChevronRight } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"
import { format } from "date-fns"
import { da } from "date-fns/locale"
import { StartlisteHeader } from "../components/header"
import { useStartliste } from "@/contexts/startlist-context"
import { FlightEvaluationDialog } from "@/components/school/flight-evaluation-dialog"
import { InstructorLog } from "@/components/school/instructor-log"

interface Exercise {
  id: string
  text: string
  order: number
}

interface Module {
  id: string
  moduleId: string
  titel: string
  exercises: Exercise[]
}

interface Requirements {
  minimum_starter: number
  minimum_flyvetimer: number
  minimum_to_sædet_skoling: number
  minimum_solo_flyvning: number
}

interface DsvuSchoolData {
  modules: Module[]
  requirements: Requirements
}

interface PilotLog {
  pilotId: string
  pilotName: string
  isGuest: boolean
  totalFlights: number
  totalFlightTime: number // in minutes
  recentFlights: SchoolFlight[]
}

interface SchoolFlight {
  id: string
  date: Date
  flightDuration: number | null // in minutes
  registration: string | null
  type: string | null
  launchMethod: string | null
  instructorName: string | null // name of the instructor (pilot2)
  takeoffTime: Date | null
  landingTime: Date | null
}

function School() {
  const [schoolData, setSchoolData] = useState<DsvuSchoolData | null>(null)
  const [pilotLogs, setPilotLogs] = useState<PilotLog[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [pilotLogsLoading, setPilotLogsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pilotLogsError, setPilotLogsError] = useState<string | null>(null)
  const [openModules, setOpenModules] = useState<Set<string>>(new Set())
  const [openPilotLogs, setOpenPilotLogs] = useState<Set<string>>(new Set())
  const [activeTab, setActiveTab] = useState("normer")
  
  // Period selection states
  const [selectedDate, setSelectedDate] = useState<Date>(new Date())
  const [calendarOpen, setCalendarOpen] = useState(false)
  const [periodFilter, setPeriodFilter] = useState<"today" | "year" | "all">("today")

  // Flight evaluation dialog states
  const [evaluationDialogOpen, setEvaluationDialogOpen] = useState(false)
  const [selectedFlight, setSelectedFlight] = useState<SchoolFlight | null>(null)
  const [selectedPilotForEvaluation, setSelectedPilotForEvaluation] = useState<{ id: string; name: string } | null>(null)

  useEffect(() => {
    fetchSchoolData()
  }, [])

  useEffect(() => {
    if (activeTab === "pilotlog") {
      fetchPilotLogs()
    }
  }, [activeTab, selectedDate, periodFilter])

  // Format date without timezone issues
  const formatDateParam = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  // Check if a date is today
  const isCurrentDate = (date: Date) => {
    const today = new Date();
    return (
      date.getDate() === today.getDate() &&
      date.getMonth() === today.getMonth() &&
      date.getFullYear() === today.getFullYear()
    );
  };

  const fetchSchoolData = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/tablet/dsvu/fetch_dsvu_school')
      const data = await response.json()

      if (data.success) {
        setSchoolData(data)
      } else {
        setError(data.error || 'Failed to fetch school data')
      }
    } catch (err) {
      setError('Failed to load school catalog')
      console.error('Error fetching school data:', err)
    } finally {
      setLoading(false)
    }
  }

  const fetchPilotLogs = async () => {
    try {
      setPilotLogsLoading(true)
      setPilotLogsError(null)
      
      // Build query parameters based on selected period
      let queryParams = '';
      if (periodFilter === "today") {
        if (!isCurrentDate(selectedDate)) {
          queryParams = `?date=${formatDateParam(selectedDate)}`;
        }
      } else if (periodFilter === "year") {
        queryParams = `?year=${selectedDate.getFullYear()}`;
      } else if (periodFilter === "all") {
        queryParams = `?all=true`;
      }

      const response = await fetch(`/api/tablet/dsvu/fetch_pilot_logs${queryParams}`)
      const data = await response.json()

      if (data.success) {
        setPilotLogs(data.pilotLogs || [])
      } else {
        setPilotLogsError(data.error || 'Failed to fetch pilot logs')
      }
    } catch (err) {
      setPilotLogsError('Failed to load pilot logs')
      console.error('Error fetching pilot logs:', err)
    } finally {
      setPilotLogsLoading(false)
    }
  }

  const toggleModule = (moduleId: string) => {
    const newOpenModules = new Set(openModules)
    if (newOpenModules.has(moduleId)) {
      newOpenModules.delete(moduleId)
    } else {
      newOpenModules.add(moduleId)
    }
    setOpenModules(newOpenModules)
  }

  const togglePilotLog = (pilotId: string) => {
    const newOpenPilotLogs = new Set(openPilotLogs)
    if (newOpenPilotLogs.has(pilotId)) {
      newOpenPilotLogs.delete(pilotId)
    } else {
      newOpenPilotLogs.add(pilotId)
    }
    setOpenPilotLogs(newOpenPilotLogs)
  }

  const handleTabChange = (value: string) => {
    setActiveTab(value);
  };

  // Handle period filter changes
  const handlePeriodChange = (period: "today" | "year" | "all") => {
    setPeriodFilter(period);
    if (period === "today") {
      setSelectedDate(new Date()); // Reset to today when switching to today view
    }
  };

  // Handle date change
  const handleDateChange = (date: Date | undefined) => {
    if (date) {
      setSelectedDate(date);
      setCalendarOpen(false);
      if (periodFilter !== "today") {
        setPeriodFilter("today"); // Switch to today view when selecting a specific date
      }
    }
  };

  // Handle flight evaluation
  const handleFlightClick = (flight: SchoolFlight, pilotId: string, pilotName: string) => {
    setSelectedFlight(flight)
    setSelectedPilotForEvaluation({ id: pilotId, name: pilotName })
    setEvaluationDialogOpen(true)
  }

  const handleCloseEvaluationDialog = () => {
    setEvaluationDialogOpen(false)
    setSelectedFlight(null)
    setSelectedPilotForEvaluation(null)
  }

  const formatFlightDuration = (minutes: number | null) => {
    if (!minutes) return 'N/A'
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    return `${hours}:${mins.toString().padStart(2, '0')}`
  }

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString('da-DK', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    })
  }

  const formatTime = (time: Date | null) => {
    if (!time) return '-'
    return new Date(time).toLocaleTimeString('da-DK', {
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const getLaunchMethodText = (method: string | null) => {
    switch (method) {
      case 'S': return 'Spilstart'
      case 'M': return 'Selvstart'
      case 'F': return 'Flyslæb'
      default: return method || 'N/A'
    }
  }

  const getModuleTypeInfo = (moduleId: string) => {
    if (moduleId.startsWith('G-')) {
      return {
        type: 'Grundlæggende',
        color: 'bg-blue-50 text-blue-700 border-blue-200',
        icon: BookOpen
      }
    } else if (moduleId.startsWith('U-')) {
      return {
        type: 'Undervisning',
        color: 'bg-green-50 text-green-700 border-green-200',
        icon: GraduationCap
      }
    }
    return {
      type: 'Modul',
      color: 'bg-gray-50 text-gray-700 border-gray-200',
      icon: BookOpen
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
          <p className="text-lg text-muted-foreground">Indlæser uddannelseskatalog...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <Alert variant="destructive" className="max-w-2xl mx-auto mt-8">
        <AlertTitle>Fejl</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    )
  }

  if (!schoolData) {
    return (
      <Alert className="max-w-2xl mx-auto mt-8">
        <AlertTitle>Ingen data</AlertTitle>
        <AlertDescription>Ingen uddannelsesdata tilgængelig</AlertDescription>
      </Alert>
    )
  }

  return (
    <div className="space-y-8 max-w-6xl mx-auto">

      {/* Tabbed Interface */}
      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        <TabsList className="w-full h-14 rounded-lg mb-6">
          <TabsTrigger 
            value="normer" 
            className="text-base flex-1 h-full rounded-md data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
          >
            <BookOpen className="h-5 w-5 mr-2" />
            Normer
          </TabsTrigger>
          <TabsTrigger 
            value="pilotlog" 
            className="text-base flex-1 h-full rounded-md data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
          >
            <FileText className="h-5 w-5 mr-2" />
            Elev log
          </TabsTrigger>
          <TabsTrigger 
            value="instructorlog" 
            className="text-base flex-1 h-full rounded-md data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
          >
            <User className="h-5 w-5 mr-2" />
            Instruktør log
          </TabsTrigger>
        </TabsList>

        <TabsContent value="normer" className="mt-0">
          <div className="space-y-8">
            {/* Modules */}
            <div className="space-y-8">
              {/* G-series modules */}
              <div className="mb-12">
                <div className="flex items-center gap-3 mb-6">
                  <BookOpen className="h-6 w-6 text-blue-600" />
                  <h3 className="text-2xl font-bold text-blue-800">Grundlæggende moduler (G-1 til G-13)</h3>
                </div>
                <div className="space-y-4">
                  {schoolData.modules
                    .filter(module => module.moduleId.startsWith('G-'))
                    .map((module) => {
                      const isOpen = openModules.has(module.moduleId)
                      return (
                        <Card key={module.id} className="border-blue-200 hover:border-blue-300 transition-colors">
                          <Collapsible>
                            <CollapsibleTrigger
                              onClick={() => toggleModule(module.moduleId)}
                              className="w-full"
                            >
                              <CardHeader className="hover:bg-blue-50/50 transition-colors py-6">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-4">
                                    {isOpen ? (
                                      <ChevronDown className="h-6 w-6 text-blue-600 flex-shrink-0" />
                                    ) : (
                                      <ChevronRight className="h-6 w-6 text-blue-600 flex-shrink-0" />
                                    )}
                                    <div className="text-left flex-1">
                                      <div className="flex items-center gap-4 mb-2">
                                        <Badge className="bg-blue-100 text-blue-800 border-blue-300 text-base px-4 py-2 font-semibold">
                                          {module.moduleId}
                                        </Badge>
                                        <CardTitle className="text-xl font-bold">{module.titel}</CardTitle>
                                      </div>
                                      <CardDescription className="text-lg text-blue-600 font-medium">
                                        {module.exercises.length} øvelser
                                      </CardDescription>
                                    </div>
                                  </div>
                                </div>
                              </CardHeader>
                            </CollapsibleTrigger>
                            
                            <CollapsibleContent>
                              <CardContent className="pt-0 pb-8 px-6">
                                <div className="bg-gradient-to-r from-blue-50 to-blue-100/50 rounded-2xl p-6 border border-blue-200/60">
                                  <div className="space-y-3">
                                    {module.exercises
                                      .sort((a, b) => a.order - b.order)
                                      .map((exercise, index) => (
                                        <div
                                          key={exercise.id}
                                          className="group flex items-start gap-5 p-5 bg-white/80 backdrop-blur-sm rounded-xl border border-blue-200/40 hover:border-blue-300 hover:shadow-sm transition-all duration-200"
                                        >
                                          <div className="flex-shrink-0">
                                            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center shadow-sm">
                                              <span className="text-white font-bold text-lg">{index + 1}</span>
                                            </div>
                                          </div>
                                          <div className="flex-1 pt-1">
                                            <p className="text-lg leading-relaxed text-gray-800 font-medium group-hover:text-gray-900 transition-colors">
                                              {exercise.text}
                                            </p>
                                          </div>
                                        </div>
                                      ))}
                                  </div>
                                </div>
                              </CardContent>
                            </CollapsibleContent>
                          </Collapsible>
                        </Card>
                      )
                    })}
                </div>
              </div>

              {/* U-series modules */}
              <div className="mb-12">
                <div className="flex items-center gap-3 mb-6">
                  <GraduationCap className="h-6 w-6 text-green-600" />
                  <h3 className="text-2xl font-bold text-green-800">Undervisningsmoduler (U-14 til U-20)</h3>
                </div>
                <div className="space-y-4">
                  {schoolData.modules
                    .filter(module => module.moduleId.startsWith('U-'))
                    .map((module) => {
                      const isOpen = openModules.has(module.moduleId)
                      return (
                        <Card key={module.id} className="border-green-200 hover:border-green-300 transition-colors">
                          <Collapsible>
                            <CollapsibleTrigger
                              onClick={() => toggleModule(module.moduleId)}
                              className="w-full"
                            >
                              <CardHeader className="hover:bg-green-50/50 transition-colors py-6">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-4">
                                    {isOpen ? (
                                      <ChevronDown className="h-6 w-6 text-green-600 flex-shrink-0" />
                                    ) : (
                                      <ChevronRight className="h-6 w-6 text-green-600 flex-shrink-0" />
                                    )}
                                    <div className="text-left flex-1">
                                      <div className="flex items-center gap-4 mb-2">
                                        <Badge className="bg-green-100 text-green-800 border-green-300 text-base px-4 py-2 font-semibold">
                                          {module.moduleId}
                                        </Badge>
                                        <CardTitle className="text-xl font-bold">{module.titel}</CardTitle>
                                      </div>
                                      <CardDescription className="text-lg text-green-600 font-medium">
                                        {module.exercises.length} øvelser
                                      </CardDescription>
                                    </div>
                                  </div>
                                </div>
                              </CardHeader>
                            </CollapsibleTrigger>
                            
                            <CollapsibleContent>
                              <CardContent className="pt-0 pb-8 px-6">
                                <div className="bg-gradient-to-r from-green-50 to-green-100/50 rounded-2xl p-6 border border-green-200/60">
                                  <div className="space-y-3">
                                    {module.exercises
                                      .sort((a, b) => a.order - b.order)
                                      .map((exercise, index) => (
                                        <div
                                          key={exercise.id}
                                          className="group flex items-start gap-5 p-5 bg-white/80 backdrop-blur-sm rounded-xl border border-green-200/40 hover:border-green-300 hover:shadow-sm transition-all duration-200"
                                        >
                                          <div className="flex-shrink-0">
                                            <div className="w-10 h-10 bg-gradient-to-br from-green-500 to-green-600 rounded-full flex items-center justify-center shadow-sm">
                                              <span className="text-white font-bold text-lg">{index + 1}</span>
                                            </div>
                                          </div>
                                          <div className="flex-1 pt-1">
                                            <p className="text-lg leading-relaxed text-gray-800 font-medium group-hover:text-gray-900 transition-colors">
                                              {exercise.text}
                                            </p>
                                          </div>
                                        </div>
                                      ))}
                                  </div>
                                </div>
                              </CardContent>
                            </CollapsibleContent>
                          </Collapsible>
                        </Card>
                      )
                    })}
                </div>
              </div>
            </div>

            {/* Requirements Card - moved to bottom */}
            {schoolData.requirements && (
              <Card className="mt-12 border-orange-200 bg-orange-50/30">
                <CardHeader className="pb-6">
                  <div className="flex items-center gap-3">
                    <Target className="h-6 w-6 text-orange-600" />
                    <CardTitle className="text-2xl text-orange-800">Minimumskrav for SPL Certifikat</CardTitle>
                  </div>
                  <CardDescription className="text-lg text-orange-700">
                    Disse krav skal opfyldes for at opnå Sailplane Pilot License (SPL)
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                    <div className="flex items-center gap-4 p-6 bg-blue-100 rounded-xl border border-blue-200">
                      <Plane className="h-8 w-8 text-blue-600 flex-shrink-0" />
                      <div>
                        <div className="font-bold text-2xl text-blue-800">{schoolData.requirements.minimum_starter}</div>
                        <div className="text-base text-blue-700 font-medium">Minimum starter</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 p-6 bg-green-100 rounded-xl border border-green-200">
                      <Clock className="h-8 w-8 text-green-600 flex-shrink-0" />
                      <div>
                        <div className="font-bold text-2xl text-green-800">{schoolData.requirements.minimum_flyvetimer} timer</div>
                        <div className="text-base text-green-700 font-medium">Minimum flyvetid</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 p-6 bg-purple-100 rounded-xl border border-purple-200">
                      <Users className="h-8 w-8 text-purple-600 flex-shrink-0" />
                      <div>
                        <div className="font-bold text-2xl text-purple-800">{schoolData.requirements.minimum_to_sædet_skoling} timer</div>
                        <div className="text-base text-purple-700 font-medium">To-sædet skoling</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 p-6 bg-amber-100 rounded-xl border border-amber-200">
                      <CheckCircle2 className="h-8 w-8 text-amber-600 flex-shrink-0" />
                      <div>
                        <div className="font-bold text-2xl text-amber-800">{schoolData.requirements.minimum_solo_flyvning} timer</div>
                        <div className="text-base text-amber-700 font-medium">Solo flyvning</div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Footer info */}
            <div className="mt-12 text-center text-base text-muted-foreground border-t pt-6">
              <p className="mb-2">Baseret på DSVU uddannelsesnormer for svæveflyvning</p>
              <p className="font-medium">Total {schoolData.modules.length} moduler • {schoolData.modules.reduce((total, module) => total + module.exercises.length, 0)} øvelser</p>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="pilotlog" className="mt-0">
          <div className="space-y-6">
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <FileText className="h-6 w-6 text-primary" />
                <h3 className="text-2xl font-bold">Pilotlog for skolingsflyvninger</h3>
              </div>

              {/* Period Selection Controls */}
              <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => handlePeriodChange("today")}
                    className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition-colors whitespace-nowrap
                      ${periodFilter === "today" && isCurrentDate(selectedDate)
                        ? "bg-primary text-primary-foreground" 
                        : "bg-muted hover:bg-muted/80"}`}
                  >
                    <Clock className="h-4 w-4" />
                    <span>I dag</span>
                  </button>
                  
                  <button 
                    onClick={() => handlePeriodChange("year")}
                    className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition-colors whitespace-nowrap
                      ${periodFilter === "year" 
                        ? "bg-primary text-primary-foreground" 
                        : "bg-muted hover:bg-muted/80"}`}
                  >
                    <CalendarIcon className="h-4 w-4" />
                    <span>Året</span>
                  </button>
                  
                  <button 
                    onClick={() => handlePeriodChange("all")}
                    className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition-colors whitespace-nowrap
                      ${periodFilter === "all" 
                        ? "bg-primary text-primary-foreground" 
                        : "bg-muted hover:bg-muted/80"}`}
                  >
                    <Target className="h-4 w-4" />
                    <span>Alle data</span>
                  </button>
                  
                  {/* Calendar Selector */}
                  <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                    <PopoverTrigger asChild>
                      <button 
                        className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition-colors whitespace-nowrap
                        ${!isCurrentDate(selectedDate) && periodFilter === "today"
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted hover:bg-muted/80"}`}
                        aria-label="Vælg dato"
                      >
                        <CalendarIcon className="h-4 w-4" />
                        <span className="hidden sm:inline">Kalender</span>
                      </button>
                    </PopoverTrigger>
                    <PopoverContent align="start" side="bottom" className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={selectedDate}
                        onSelect={handleDateChange}
                        initialFocus
                        locale={da}
                        modifiers={{
                          weekend: (date) => {
                            const day = date.getDay();
                            return day === 0 || day === 6;
                          }
                        }}
                        modifiersClassNames={{
                          weekend: "bg-muted/50 text-muted-foreground"
                        }}
                      />
                    </PopoverContent>
                  </Popover>
                </div>

                <div className="text-sm text-muted-foreground">
                  {periodFilter === "today" 
                    ? `Data for ${format(selectedDate, 'dd. MMMM yyyy', { locale: da })}${isCurrentDate(selectedDate) ? ' (i dag)' : ''}` 
                    : periodFilter === "year"
                      ? `Årsdata for ${selectedDate.getFullYear()}`
                      : 'Alle skolingsflyvninger'}
                </div>
              </div>
            </div>

            {pilotLogsLoading && (
              <div className="flex items-center justify-center py-12">
                <div className="text-center">
                  <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
                  <p className="text-lg text-muted-foreground">Indlæser pilotlog...</p>
                </div>
              </div>
            )}

            {pilotLogsError && (
              <Alert variant="destructive">
                <AlertTitle>Fejl</AlertTitle>
                <AlertDescription>{pilotLogsError}</AlertDescription>
              </Alert>
            )}

            {!pilotLogsLoading && !pilotLogsError && pilotLogs && (
              <>
                {pilotLogs.length === 0 ? (
                  <Card>
                    <CardContent className="text-center py-12">
                      <FileText className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                      <p className="text-xl text-muted-foreground mb-2">Ingen skolingsflyvninger fundet</p>
                      <p className="text-base text-muted-foreground">Der er endnu ikke registreret nogen skolingsflyvninger for denne klub</p>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="space-y-6">
                    {/* Pilot Logs */}
                    <div className="space-y-4">
                      {pilotLogs.map((pilotLog) => {
                        const isOpen = openPilotLogs.has(pilotLog.pilotId)
                        return (
                          <Card key={pilotLog.pilotId} className="border-gray-200 hover:border-gray-300 transition-colors">
                            <Collapsible>
                              <CollapsibleTrigger
                                onClick={() => togglePilotLog(pilotLog.pilotId)}
                                className="w-full"
                              >
                                <CardHeader className="pb-4 hover:bg-gray-50/50 transition-colors">
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                      {isOpen ? (
                                        <ChevronDown className="h-6 w-6 text-gray-600 flex-shrink-0" />
                                      ) : (
                                        <ChevronRight className="h-6 w-6 text-gray-600 flex-shrink-0" />
                                      )}
                                      <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center">
                                        {pilotLog.isGuest ? (
                                          <Users className="h-6 w-6 text-white" />
                                        ) : (
                                          <UserCheck className="h-6 w-6 text-white" />
                                        )}
                                      </div>
                                      <div className="text-left">
                                        <CardTitle className="text-xl">{pilotLog.pilotName}</CardTitle>
                                        <CardDescription className="text-base">
                                          {pilotLog.isGuest ? 'Gæstepilot • ' : ''}{pilotLog.totalFlights} flyvninger
                                        </CardDescription>
                                      </div>
                                    </div>
                                    <div className="text-right">
                                      <div className="text-2xl font-bold text-primary">{formatFlightDuration(pilotLog.totalFlightTime)}</div>
                                      <div className="text-sm text-muted-foreground">total flyvetid</div>
                                    </div>
                                  </div>
                                </CardHeader>
                              </CollapsibleTrigger>
                              
                              <CollapsibleContent>
                                <CardContent className="pt-0">
                                  {pilotLog.recentFlights.length > 0 && (
                                    <div>
                                      <div className="space-y-3">
                                        {pilotLog.recentFlights.map((flight) => (
                                          <div 
                                            key={flight.id} 
                                            className="bg-gray-50 rounded-lg p-4 border border-gray-200 hover:bg-gray-100 cursor-pointer transition-colors"
                                            onClick={() => handleFlightClick(flight, pilotLog.pilotId, pilotLog.pilotName)}
                                          >
                                            <div className="flex justify-between items-start mb-2">
                                              <div className="flex items-center gap-3">
                                                <Badge variant="default" className="text-sm bg-blue-100 text-blue-800 hover:bg-blue-100">
                                                  Elev
                                                </Badge>
                                                <span className="font-medium text-gray-800">
                                                  {flight.registration || 'N/A'} {flight.type && `(${flight.type})`}
                                                </span>
                                              </div>
                                              <span className="text-sm text-gray-600">{formatDate(flight.date)}</span>
                                            </div>
                                            
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                                              <div>
                                                <span className="text-gray-600">Start tid:</span>
                                                <span className="ml-2 font-medium">{formatTime(flight.takeoffTime)}</span>
                                              </div>
                                              <div>
                                                <span className="text-gray-600">Landing tid:</span>
                                                <span className="ml-2 font-medium">{formatTime(flight.landingTime)}</span>
                                              </div>
                                              <div>
                                                <span className="text-gray-600">Flyvetid:</span>
                                                <span className="ml-2 font-medium">{formatFlightDuration(flight.flightDuration)}</span>
                                              </div>
                                              <div className="sm:col-span-2">
                                                <span className="text-gray-600">Instruktør:</span>
                                                <span className="ml-2 font-medium">{flight.instructorName || 'Solo'}</span>
                                              </div>
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </CardContent>
                              </CollapsibleContent>
                            </Collapsible>
                          </Card>
                        )
                      })}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </TabsContent>

        <TabsContent value="instructorlog" className="mt-0">
          <InstructorLog isVisible={activeTab === "instructorlog"} />
        </TabsContent>
      </Tabs>

      {/* Flight Evaluation Dialog */}
      {selectedFlight && selectedPilotForEvaluation && schoolData && (
        <FlightEvaluationDialog
          isOpen={evaluationDialogOpen}
          onClose={handleCloseEvaluationDialog}
          flight={selectedFlight}
          pilotId={selectedPilotForEvaluation.id}
          pilotName={selectedPilotForEvaluation.name}
          modules={schoolData.modules}
        />
      )}
    </div>
  )
}

// Wrap the page content with Suspense
export default function SchoolPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen w-full flex-col bg-background">
        <div className="flex h-screen items-center justify-center">
          <div className="text-center">
            <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
            <p className="text-lg text-muted-foreground">Indlæser uddannelseskatalog...</p>
          </div>
        </div>
      </div>
    }>
      <SchoolPageContent />
    </Suspense>
  );
}

// Main component using the context
function SchoolPageContent() {
  const {
    // WebSocket state
    wsConnected,
    isAuthenticatedOnWs,
    pingStatus,

    // UI state
    showDisconnectionDialog,
    setShowDisconnectionDialog,
    showRolesDialog,
    setShowRolesDialog,

    // Data state
    dailyInfo,
    tcasAlert,

    // Functions
    goToSettings,
  } = useStartliste()

  return (
    <div className="flex min-h-screen w-full flex-col bg-background overflow-hidden">
      {/* Offline alert dialog based on WebSocket connection with delay */}
      <AlertDialog open={showDisconnectionDialog} onOpenChange={(open) => {
        // Allow manual dismissal but it will reappear if still disconnected
        if (!open) setShowDisconnectionDialog(false);
      }}>
        <AlertDialogContent>
          <div className="flex flex-col items-center text-center p-2">
            <div className="rounded-full bg-red-100 p-3 mb-4">
              <WifiOff className="h-8 w-8 text-red-600" />
            </div>
            <AlertDialogHeader>
              <AlertDialogTitle className="text-xl">
                Ingen forbindelse til serveren
              </AlertDialogTitle>
              <AlertDialogDescription className="text-base">
                Det ser ud til, at du har mistet forbindelsen til serveren.
                Appen vil automatisk genoprette forbindelsen.
              </AlertDialogDescription>
            </AlertDialogHeader>
            
            <div className="flex items-center justify-center space-x-2 mt-6 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>Forsøger at oprette forbindelse...</span>
            </div>
          </div>
        </AlertDialogContent>
      </AlertDialog>

      {/* Missing roles alert dialog */}
      <AlertDialog open={showRolesDialog} onOpenChange={setShowRolesDialog}>
        <AlertDialogContent>
          <div className="flex flex-col items-center text-center p-2">
            <div className="rounded-full bg-blue-100 p-3 mb-4">
              <User className="h-8 w-8 text-blue-600" />
            </div>
            <AlertDialogHeader>
              <AlertDialogTitle className="text-xl">
                Vælg dagens bemanding
              </AlertDialogTitle>
              <AlertDialogDescription className="text-base">
                For at kunne registrere flyvninger korrekt, skal du angive dagens trafikleder og spilfører.
              </AlertDialogDescription>
            </AlertDialogHeader>
            
            <div className="w-full mt-6">
              <Button 
                variant="default" 
                className="w-full h-12 text-base" 
                onClick={goToSettings}
              >
                <SettingsIcon className="mr-2 h-5 w-5" />
                Gå til indstillinger
              </Button>
            </div>
          </div>
        </AlertDialogContent>
      </AlertDialog>
      
      <main className="flex flex-1 flex-col overflow-hidden">
        {/* Fixed header section - always visible when scrolling */}
        <StartlisteHeader 
          wsConnected={wsConnected} 
          isAuthenticatedOnWs={isAuthenticatedOnWs}
          pingStatus={pingStatus} 
          dailyInfo={dailyInfo}
          tcasAlert={tcasAlert}
        />
        
        {/* Add padding to content to account for fixed header height - minimal on mobile */}
        <div className="h-[44px] sm:h-[var(--fixed-header-total-height)] flex-shrink-0"></div>

        {/* Main content - bottom padding for nav bar */}
        <div className="flex-1 p-2 pt-1 pb-[76px] sm:p-3 sm:pt-12 sm:pb-3 m-0 overflow-y-auto">
          <School />
        </div>
      </main>
    </div>
  )
}
