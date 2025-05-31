"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Loader2, Calendar, Clock, Users, GraduationCap, Plane, RefreshCw, Target, Calendar as CalendarIcon, ChevronDown, ChevronRight } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Calendar as CalendarComponent } from "@/components/ui/calendar"
import { format } from "date-fns"
import { da } from "date-fns/locale"

interface InstructorFlight {
  id: string
  date: Date
  flightDuration: number | null
  registration: string | null
  type: string | null
  studentName: string | null
  takeoffTime: Date | null
  landingTime: Date | null
  launchMethod: string | null
  isSchoolFlight: boolean
}

interface InstructorLog {
  instructorId: string
  instructorName: string
  isGuest: boolean
  totalFlights: number
  totalFlightTime: number
  recentFlights: InstructorFlight[]
}

interface InstructorLogProps {
  isVisible: boolean // Only fetch when this tab is visible
}

type DateFilter = 'today' | 'year' | 'all'

export function InstructorLog({ isVisible }: InstructorLogProps) {
  const [instructorLogs, setInstructorLogs] = useState<InstructorLog[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [dateFilter, setDateFilter] = useState<DateFilter>('today')
  const [selectedDate, setSelectedDate] = useState<Date>(new Date())
  const [calendarOpen, setCalendarOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expandedInstructors, setExpandedInstructors] = useState<Set<string>>(new Set())

  const fetchInstructorLog = async () => {
    setIsLoading(true)
    setError(null)

    try {
      // Build query parameters based on selected period
      let queryParams = '';
      if (dateFilter === "today") {
        if (!isCurrentDate(selectedDate)) {
          queryParams = `?date=${formatDateParam(selectedDate)}`;
        }
      } else if (dateFilter === "year") {
        queryParams = `?year=${selectedDate.getFullYear()}`;
      } else if (dateFilter === "all") {
        queryParams = `?all=true`;
      }

      const response = await fetch(`/api/tablet/dsvu/fetch_instructor_log${queryParams}`)
      const data = await response.json()

      if (data.success) {
        setInstructorLogs(data.instructorLogs?.map((log: any) => ({
          ...log,
          recentFlights: log.recentFlights?.map((flight: any) => ({
            ...flight,
            date: new Date(flight.date),
            takeoffTime: flight.takeoffTime ? new Date(flight.takeoffTime) : null,
            landingTime: flight.landingTime ? new Date(flight.landingTime) : null,
          })) || []
        })) || [])
      } else {
        setError(data.error || "Failed to fetch instructor log")
      }
    } catch (error) {
      console.error('Error fetching instructor log:', error)
      setError("Network error occurred")
    } finally {
      setIsLoading(false)
    }
  }

  // Only fetch when visible
  useEffect(() => {
    if (isVisible) {
      fetchInstructorLog()
    }
  }, [isVisible, dateFilter, selectedDate])

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

  // Handle period filter changes
  const handlePeriodChange = (period: "today" | "year" | "all") => {
    setDateFilter(period);
    if (period === "today") {
      setSelectedDate(new Date()); // Reset to today when switching to today view
    }
  };

  // Handle date change
  const handleDateChange = (date: Date | undefined) => {
    if (date) {
      setSelectedDate(date);
      setCalendarOpen(false);
      if (dateFilter !== "today") {
        setDateFilter("today"); // Switch to today view when selecting a specific date
      }
    }
  };

  // Toggle instructor expansion
  const toggleInstructor = (instructorId: string) => {
    const newExpanded = new Set(expandedInstructors);
    if (newExpanded.has(instructorId)) {
      newExpanded.delete(instructorId);
    } else {
      newExpanded.add(instructorId);
    }
    setExpandedInstructors(newExpanded);
  };

  const formatTime = (time: Date | null) => {
    if (!time) return '-'
    return time.toLocaleTimeString('da-DK', {
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('da-DK', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    })
  }

  const formatFlightDuration = (minutes: number | null) => {
    if (!minutes) return 'N/A'
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    return `${hours}:${mins.toString().padStart(2, '0')}`
  }

  const formatTotalTime = (minutes: number) => {
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    return `${hours}t ${mins}m`
  }

  if (!isVisible) {
    return (
      <div className="flex items-center justify-center py-8 text-gray-500">
        <Calendar className="h-6 w-6 mr-2" />
        <span>Instruktør log vil blive indlæst når fanen er aktiv</span>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header with filters */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <GraduationCap className="h-6 w-6 text-primary" />
          <h3 className="text-2xl font-bold">Instruktør log</h3>
        </div>

        {/* Period Selection Controls */}
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <div className="flex items-center gap-2">
            <button 
              onClick={() => handlePeriodChange("today")}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition-colors whitespace-nowrap
                ${dateFilter === "today" && isCurrentDate(selectedDate)
                  ? "bg-primary text-primary-foreground" 
                  : "bg-muted hover:bg-muted/80"}`}
            >
              <Clock className="h-4 w-4" />
              <span>I dag</span>
            </button>
            
            <button 
              onClick={() => handlePeriodChange("year")}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition-colors whitespace-nowrap
                ${dateFilter === "year" 
                  ? "bg-primary text-primary-foreground" 
                  : "bg-muted hover:bg-muted/80"}`}
            >
              <CalendarIcon className="h-4 w-4" />
              <span>Året</span>
            </button>
            
            <button 
              onClick={() => handlePeriodChange("all")}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition-colors whitespace-nowrap
                ${dateFilter === "all" 
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
                  ${!isCurrentDate(selectedDate) && dateFilter === "today"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted hover:bg-muted/80"}`}
                  aria-label="Vælg dato"
                >
                  <CalendarIcon className="h-4 w-4" />
                  <span className="hidden sm:inline">Kalender</span>
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" side="bottom" className="w-auto p-0">
                <CalendarComponent
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
            {dateFilter === "today" 
              ? `Data for ${format(selectedDate, 'dd. MMMM yyyy', { locale: da })}${isCurrentDate(selectedDate) ? ' (i dag)' : ''}` 
              : dateFilter === "year"
                ? `Årsdata for ${selectedDate.getFullYear()}`
                : 'Alle instruktørflyvninger'}
          </div>
        </div>
      </div>

      {error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6">
            <p className="text-red-800">{error}</p>
          </CardContent>
        </Card>
      )}

      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
            <p className="text-lg text-muted-foreground">Indlæser instruktør log...</p>
          </div>
        </div>
      )}

      {!isLoading && (
        <>
          {instructorLogs.length === 0 ? (
            <Card>
              <CardContent className="text-center py-12">
                <GraduationCap className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                <p className="text-xl text-muted-foreground mb-2">Ingen instruktører fundet</p>
                <p className="text-base text-muted-foreground">Der er endnu ikke registreret nogen instruktørflyvninger for denne periode</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {instructorLogs.map(instructor => {
                const isExpanded = expandedInstructors.has(instructor.instructorId);
                return (
                  <Card key={instructor.instructorId} className="overflow-hidden">
                    <CardHeader 
                      className="cursor-pointer hover:bg-muted/50 transition-colors"
                      onClick={() => toggleInstructor(instructor.instructorId)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          {isExpanded ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
                          <div>
                            <CardTitle className="text-lg">{instructor.instructorName}</CardTitle>
                            <p className="text-sm text-muted-foreground">
                              {instructor.totalFlights} starter · {formatTotalTime(instructor.totalFlightTime)} flyvetid
                              {instructor.isGuest && <Badge variant="outline" className="ml-2">Gæst</Badge>}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary">{instructor.totalFlights} flyvninger</Badge>
                        </div>
                      </div>
                    </CardHeader>
                    
                    {isExpanded && (
                      <CardContent className="pt-0">
                        <div className="space-y-3">
                          {instructor.recentFlights.map(flight => (
                            <div 
                              key={flight.id} 
                              className="bg-gray-50 rounded-lg p-4 border border-gray-200"
                            >
                              <div className="flex justify-between items-start mb-2">
                                <div className="flex items-center gap-3">
                                  <Badge variant={flight.isSchoolFlight ? "default" : "secondary"} className="text-sm">
                                    {flight.isSchoolFlight ? "Skole" : "Almindelig"}
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
                                  <span className="text-gray-600">Elev:</span>
                                  <span className="ml-2 font-medium">{flight.studentName || 'N/A'}</span>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
} 