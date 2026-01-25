"use client"

import { Suspense, useState, useEffect, ReactElement } from "react"
import { Loader2, WifiOff, User, SettingsIcon } from "lucide-react"
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription } from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { StartlisteHeader } from "../components/header"
import { useStartliste } from "@/contexts/startlist-context"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { 
  BarChart2, FileBarChart, Info, Clock, Plane, Users,
  CircleAlert, Calendar as CalendarIcon, GraduationCap, Timer, Award,
  ArrowUp, Ruler, Wind, MapPin, School, Play
} from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { format } from "date-fns"
import { da } from "date-fns/locale"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import dynamic from "next/dynamic"
import React from "react"
import { PilotDetailsDialog } from "@/components/statistics/pilot-details-dialog"

// Dynamically import StatisticsReplayMap with SSR turned off
const StatisticsReplayMap = dynamic(() => 
  import("@/components/statistics/map").then(mod => mod.StatisticsReplayMap), 
  { 
    ssr: false,
    loading: () => (
      <div className="fixed inset-0 bg-background/80 flex items-center justify-center z-50">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
      </div>
    ) 
  }
)

interface StatisticsProps {
  socket: WebSocket | null;
  wsConnected: boolean;
  authenticatedChannel: string | null;
}

// Interfaces for statistics data
interface Summary {
  totalFlights: number;
  flightsInProgress: number;
  completedFlights: number;
  totalFlightTime: string;
  totalFlightTimeMinutes: number;
  totalFlightTimeHours: number;
  totalFlightTimeRemainingMinutes: number;
}

interface PilotStat {
  id: string;
  name: string;
  isGuest?: boolean;
  flightCount: number;
  flightTimeMinutes: number;
  flightTime: string;
  flightHours: number;
  flightMinutes: number;
  instructorFlights: number;
  studentFlights: number;
  soloFlights: number;
  instructorTimeMinutes: number;
  normalTimeMinutes: number;
  instructorTime: string;
  instructorHours: number;
  instructorMinutesFormatted: number;
  normalTime: string;
  normalHours: number;
  normalMinutesFormatted: number;
  totalDistance?: number;
  maxAltitude?: number;
  maxSpeed?: number;
}

interface AircraftStat {
  id: string;
  registration: string;
  type: string;
  flightCount: number;
  flightTimeMinutes: number;
  flightTime: string;
  flightHours: number;
  flightMinutes: number;
  schoolFlightCount: number;
}

interface LongestFlight {
  durationMinutes: number;
  formattedDuration: string;
  pilotName: string;
  isGuestPilot: boolean;
  aircraftRegistration: string;
  date?: string;
}

interface FlightDetails {
  id: string;
  registration: string;
  type: string;
  pilot: string;
  coPilot: string | null;
  takeoffTime: string;
  landingTime: string;
  duration: string;
  durationMinutes: number;
  status: string;
  isSchoolFlight: boolean;
  takeoffAirfield: string;
  landingAirfield: string;
  distance: number | null;
  maxAltitude: number | null;
  maxSpeed: number | null;
  date: string | null;
}

interface PeriodStats {
  summary: Summary;
  pilots: PilotStat[];
  aircraft: AircraftStat[];
  longestFlight?: LongestFlight;
  flights: FlightDetails[];
  records?: {
    distance: RecordMetric | null;
    altitude: RecordMetric | null;
    speed: RecordMetric | null;
  };
}

interface RecordMetric {
  value: number;
  pilotName: string;
  aircraftRegistration: string;
}

interface StatisticsData {
  date: string;
  today: PeriodStats;
  year?: PeriodStats;
}

function Statistics({ socket, wsConnected, authenticatedChannel }: StatisticsProps): ReactElement {
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingYear, setIsLoadingYear] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [stats, setStats] = useState<StatisticsData | null>(null)
  const [timeFrame, setTimeFrame] = useState<"today" | "year">("today")
  const [activeTab, setActiveTab] = useState("summary")
  const [selectedDate, setSelectedDate] = useState<Date>(new Date())
  const [calendarOpen, setCalendarOpen] = useState(false)
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear())
  const [selectedFlightForReplay, setSelectedFlightForReplay] = useState<{ id: string; registration: string } | null>(null)
  const [selectedPilotForDetails, setSelectedPilotForDetails] = useState<PilotStat | null>(null)
  const [datesWithFlights, setDatesWithFlights] = useState<Date[]>([])
  
  // Search and filter states
  const [pilotSearchTerm, setPilotSearchTerm] = useState("")
  const [flightSearchTerm, setFlightSearchTerm] = useState("")
  const [pilotSortOption, setPilotSortOption] = useState<"flightCount" | "flightTime" | "name">("flightCount")
  const [flightSortOption, setFlightSortOption] = useState<"takeoffTime" | "duration" | "distance" | "altitude" | "speed">("takeoffTime")
  
  // Replace the three separate view mode states with a single unified state
  const [viewMode, setViewMode] = useState<"card" | "table">(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('statisticsViewMode') as "card" | "table" || "card";
    }
    return "card";
  })
  
  // Update localStorage when view mode changes
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('statisticsViewMode', viewMode);
    }
  }, [viewMode]);
  
  // Format date without timezone issues
  const formatDateParam = (date: Date) => {
    // Fix timezone issues by ensuring we get YYYY-MM-DD in local time
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  
  // Fetch statistics data for a specific date or period
  const fetchStatistics = async (date: Date, period: "today" | "year", year?: number) => {
    const isToday = period === "today";

    if (isToday) {
      setIsLoading(true);
    } else {
      setIsLoadingYear(true);
    }

    setError(null);

    try {
      // Format the date in YYYY-MM-DD for the API
      const formattedDate = formatDateParam(date);

      // Check if this is today's date
      const today = new Date();
      const isCurrentDate =
        date.getDate() === today.getDate() &&
        date.getMonth() === today.getMonth() &&
        date.getFullYear() === today.getFullYear();

      // Only include date parameter if it's not today
      const dateParam = isCurrentDate ? '' : `&date=${formattedDate}`;

      // For year view, use the year parameter to set the date range
      const yearParam = period === "year" && year ? `&year=${year}` : '';

      const response = await fetch(`/api/tablet/fetch_statistics?period=${period}${dateParam}${yearParam}`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch statistics: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.success) {
        if (isToday) {
          setStats(data);
        } else {
          setStats(prevStats => {
            if (!prevStats) return data;
            return { ...prevStats, year: data.year };
          });
        }
      } else {
        setError(data.error || 'Failed to load statistics');
      }
    } catch (err) {
      console.error(`Error fetching ${period} statistics:`, err);
      setError(`Der opstod en fejl ved hentning af statistikker`);
    } finally {
      if (isToday) {
        setIsLoading(false);
      } else {
        setIsLoadingYear(false);
      }
    }
  };
  
  // Fetch statistics for the selected date
  useEffect(() => {
    fetchStatistics(selectedDate, "today");
  }, [selectedDate]);
  
  // Set up listener for WebSocket updates
  useEffect(() => {
    if (socket) {
      const handleMessage = (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data);
          
          // If flight data is updated, only refresh statistics if it's relevant to the current date
          if (data.type === 'flight_update') {
            // Check if the flight update is for the currently selected date
            const flightDate = data.data?.date || data.data?.takeoff_date;
            const selectedDateString = formatDateParam(selectedDate);
            
            // Only reload if the flight update is for the currently viewed date
            if (flightDate === selectedDateString) {
              fetchStatistics(selectedDate, "today");
              
              // Also refresh year data if it's loaded and currently viewing yearly stats
              if (timeFrame === "year" && stats?.year) {
                fetchStatistics(selectedDate, "year");
              }
            }
          }
        } catch (err) {
          // Ignore non-JSON messages
        }
      };
      
      socket.addEventListener('message', handleMessage);
      
      return () => {
        socket.removeEventListener('message', handleMessage);
      };
    }
  }, [socket, selectedDate, timeFrame, stats?.year]);
  
  // Function to fetch yearly statistics
  const fetchYearlyStatistics = async (year?: number) => {
    const targetYear = year ?? selectedYear;
    fetchStatistics(selectedDate, "year", targetYear);
  };
  
  // Handle tab changes
  const handleTabChange = (value: string) => {
    setActiveTab(value);
  };
  
  // Handle time frame changes
  const handleTimeFrameChange = (value: "today" | "year") => {
    setTimeFrame(value);

    // Fetch yearly data if switching to year view
    if (value === "year") {
      fetchYearlyStatistics(selectedYear);
    }
  };

  // Handle year selection change
  const handleYearChange = (year: string) => {
    const yearNumber = parseInt(year, 10);
    setSelectedYear(yearNumber);
    // Switch to year view if not already there
    if (timeFrame !== "year") {
      setTimeFrame("year");
    }
    // Clear existing year stats and fetch new data
    setStats(prevStats => prevStats ? { ...prevStats, year: undefined } : null);
    fetchYearlyStatistics(yearNumber);
  };

  // Generate list of available years (from 2020 to current year)
  const availableYears = React.useMemo(() => {
    const currentYear = new Date().getFullYear();
    const years: number[] = [];
    for (let year = currentYear; year >= 2020; year--) {
      years.push(year);
    }
    return years;
  }, []);
  
  // Handle date change
  const handleDateChange = (date: Date | undefined) => {
    if (date) {
      setSelectedDate(date);
      setCalendarOpen(false);
    }
  };

  // Fetch dates with flight activity for the current year
  useEffect(() => {
    const fetchFlightActivityDates = async () => {
      try {
        const year = selectedDate.getFullYear();

        const response = await fetch(`/api/tablet/flight_activity_dates?year=${year}`);
        const data = await response.json();

        if (data.success && data.dates) {
          // Convert date strings to Date objects
          const dates = data.dates.map((dateStr: string) => new Date(dateStr + 'T12:00:00'));
          setDatesWithFlights(dates);
        }
      } catch (error) {
        console.error('Failed to fetch flight activity dates:', error);
      }
    };

    fetchFlightActivityDates();
  }, [selectedDate.getFullYear()]);
  
  // Format date
  const formatDate = (dateString: string) => {
    const options: Intl.DateTimeFormatOptions = { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    }
    return new Date(dateString).toLocaleDateString('da-DK', options)
  }
  
  // Format time beautifully
  const formatTime = (hours: number, minutes: number) => {
    if (hours === 0 && minutes === 0) return "0 minutter";
    
    const parts = [];
    if (hours > 0) {
      parts.push(`${hours} ${hours === 1 ? 'time' : 'timer'}`);
    }
    
    if (minutes > 0) {
      parts.push(`${minutes} ${minutes === 1 ? 'minut' : 'minutter'}`);
    }
    
    return parts.join(' og ');
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
  
  // Function to filter and sort pilots
  const getFilteredSortedPilots = (pilots: PilotStat[]) => {
    if (!pilots) return [];
    
    // Filter by search term
    const filtered = pilots.filter(pilot => 
      pilot.name.toLowerCase().includes(pilotSearchTerm.toLowerCase())
    );
    
    // Sort based on selected option
    const sorted = [...filtered].sort((a, b) => {
      if (pilotSortOption === "flightCount") {
        return b.flightCount - a.flightCount;
      } else if (pilotSortOption === "flightTime") {
        return b.flightTimeMinutes - a.flightTimeMinutes;
      } else if (pilotSortOption === "name") {
        return a.name.localeCompare(b.name);
      }
      return 0;
    });
    
    return sorted;
  };
  
  // Function to filter and sort flights
  const getFilteredSortedFlights = (flights: FlightDetails[]) => {
    if (!flights) return [];
    
    // Filter by search term (pilot name or registration)
    const filtered = flights.filter(flight => 
      flight.pilot.toLowerCase().includes(flightSearchTerm.toLowerCase()) ||
      (flight.coPilot && flight.coPilot.toLowerCase().includes(flightSearchTerm.toLowerCase())) ||
      flight.registration.toLowerCase().includes(flightSearchTerm.toLowerCase())
    );
    
    // Sort based on selected option
    const sorted = [...filtered].sort((a, b) => {
      if (flightSortOption === "duration") {
        return b.durationMinutes - a.durationMinutes;
      } else if (flightSortOption === "distance") {
        const distanceA = a.distance || 0;
        const distanceB = b.distance || 0;
        return distanceB - distanceA;
      } else if (flightSortOption === "altitude") {
        const altitudeA = a.maxAltitude || 0;
        const altitudeB = b.maxAltitude || 0;
        return altitudeB - altitudeA;
      } else if (flightSortOption === "speed") {
        const speedA = a.maxSpeed || 0;
        const speedB = b.maxSpeed || 0;
        return speedB - speedA;
      } else {
        // takeoffTime (default) - most recent first
        // Handle the case where takeoffTime is "-" (not taken off yet)
        if (a.takeoffTime === "-" && b.takeoffTime !== "-") return -1;
        if (a.takeoffTime !== "-" && b.takeoffTime === "-") return 1;
        if (a.takeoffTime === "-" && b.takeoffTime === "-") return 0;
        
        // For flights with takeoff time, parse and compare times
        const timeA = a.takeoffTime.split(":"); 
        const timeB = b.takeoffTime.split(":");
        
        const hourA = parseInt(timeA[0]);
        const hourB = parseInt(timeB[0]);
        
        if (hourA !== hourB) return hourB - hourA;
        
        const minA = parseInt(timeA[1]);
        const minB = parseInt(timeB[1]);
        
        return minB - minA;
      }
    });
    
    return sorted;
  };
  
  // Loading state
  if (isLoading) {
    return (
      <div className="w-full flex flex-col items-center justify-center py-12">
        <Loader2 className="h-14 w-14 animate-spin text-primary mb-5" />
        <p className="text-lg font-medium text-center">Indlæser statistikker...</p>
      </div>
    )
  }
  
  // Error state
  if (error) {
    return (
      <Alert variant="destructive" className="my-6 p-5">
        <CircleAlert className="h-5 w-5" />
        <AlertDescription className="text-base ml-2">{error}</AlertDescription>
      </Alert>
    )
  }
  
  // No data state
  if (!stats || !stats.today) {
    return (
      <div className="w-full">
        <Alert className="my-6 p-5">
          <Info className="h-5 w-5" />
          <AlertDescription className="text-base ml-2">
            Ingen statistikker tilgængelige. Prøv igen senere.
          </AlertDescription>
        </Alert>
      </div>
    )
  }
  
  // Check if we have data for the current timeframe
  const hasYearData = stats.year !== undefined;
  const currentStats = timeFrame === "today" || (!hasYearData && !isLoadingYear)
    ? stats.today
    : stats.year || stats.today; // Fallback to today's data if year data is still undefined
  const isYearLoading = timeFrame === "year" && !hasYearData && isLoadingYear;
  
  // Success state - display statistics in tabs
  return (
    <div className="space-y-4 w-full">
      <Card className="shadow-sm">
        <CardHeader className="pb-0">
          <div className="flex flex-col gap-3">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-2 sm:gap-3">
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                <CardTitle className="text-xl sm:text-2xl font-bold">Statistik</CardTitle>
                
                {/* Mobile subtitle showing current section */}
                <div className="sm:hidden">
                  <span className="text-sm font-medium text-muted-foreground">
                    {activeTab === "summary" && "Oversigt"}
                    {activeTab === "flights" && "Flyvninger"}
                    {activeTab === "pilots" && "Piloter"}
                    {activeTab === "aircraft" && "Fly"}
                  </span>
                </div>
                
                {/* Time Frame Selector - Horizontal Pills */}
                <div className="flex items-center gap-2 sm:gap-2">
                  <button 
                    onClick={() => {
                      setSelectedDate(new Date());
                      handleTimeFrameChange("today");
                    }}
                    className={`flex items-center gap-1.5 sm:gap-1.5 px-4 sm:px-3 py-2 sm:py-1.5 rounded-full text-sm sm:text-sm font-medium transition-colors whitespace-nowrap
                      ${timeFrame === "today" && isCurrentDate(selectedDate)
                        ? "bg-primary text-primary-foreground" 
                        : "bg-muted hover:bg-muted/80"}`}
                  >
                    <Clock className="h-4 w-4 sm:h-4 sm:w-4" />
                    <span>I dag</span>
                  </button>
                  {/* Year Selector with Dropdown */}
                  <div className="flex items-center">
                    <button
                      onClick={() => handleTimeFrameChange("year")}
                      className={`flex items-center gap-1.5 sm:gap-1.5 px-4 sm:px-3 py-2 sm:py-1.5 rounded-l-full text-sm sm:text-sm font-medium transition-colors whitespace-nowrap
                        ${timeFrame === "year"
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted hover:bg-muted/80"}`}
                    >
                      <CalendarIcon className="h-4 w-4 sm:h-4 sm:w-4" />
                      <span>År</span>
                    </button>
                    <Select value={selectedYear.toString()} onValueChange={handleYearChange}>
                      <SelectTrigger
                        className={`w-[80px] h-auto px-2 py-2 sm:py-1.5 rounded-l-none rounded-r-full border-l text-sm font-medium
                          ${timeFrame === "year"
                            ? "bg-primary text-primary-foreground border-primary-foreground/30"
                            : "bg-muted border-muted-foreground/20 hover:bg-muted/80"}`}
                      >
                        <SelectValue placeholder={selectedYear.toString()} />
                      </SelectTrigger>
                      <SelectContent>
                        {availableYears.map((year) => (
                          <SelectItem key={year} value={year.toString()}>
                            {year}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Calendar Selector */}
                  <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                    <PopoverTrigger asChild>
                      <button 
                        className={`flex items-center gap-1.5 sm:gap-1.5 px-4 sm:px-3 py-2 sm:py-1.5 rounded-full text-sm sm:text-sm font-medium transition-colors whitespace-nowrap
                        ${!isCurrentDate(selectedDate) && timeFrame === "today"
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted hover:bg-muted/80"}`}
                        aria-label="Vælg dato"
                      >
                        <CalendarIcon className="h-4 w-4 sm:h-4 sm:w-4" />
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
                            return day === 0 || day === 6; // 0 is Sunday, 6 is Saturday
                          },
                          hasFlights: datesWithFlights
                        }}
                        modifiersClassNames={{
                          weekend: "bg-muted/50 text-muted-foreground",
                          hasFlights: "font-semibold relative after:content-[''] after:absolute after:bottom-1 after:left-1/2 after:-translate-x-1/2 after:h-1 after:w-1 after:rounded-full after:bg-primary"
                        }}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
              
              <CardDescription className="text-sm sm:text-base mt-1 order-3 sm:order-none">
                {timeFrame === "today"
                  ? `Statistik for ${format(selectedDate, 'dd. MMMM yyyy', { locale: da })}${isCurrentDate(selectedDate) ? ' (i dag)' : ''}`
                  : `Årsstatistik for ${selectedYear}`}
              </CardDescription>
            </div>
            
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 order-2 sm:order-none">
              <div className="flex flex-wrap items-center gap-2">
                <Badge 
                  variant="outline" 
                  className="text-sm sm:text-base font-medium py-1 px-2 sm:px-3 flex items-center gap-1 sm:gap-1.5 border"
                >
                  <Clock className="h-3 w-3 sm:h-4 sm:w-4 text-primary" />
                  <span>
                    {currentStats ? formatTime(
                      currentStats.summary.totalFlightTimeHours, 
                      currentStats.summary.totalFlightTimeRemainingMinutes
                    ) : '0 minutter'}
                  </span>
                </Badge>
                
                <Badge 
                  variant="outline" 
                  className="text-sm sm:text-base font-medium py-1 px-2 sm:px-3 flex items-center gap-1 sm:gap-1.5 border"
                >
                  <Plane className="h-3 w-3 sm:h-4 sm:w-4 text-primary" />
                  <span>{currentStats ? currentStats.summary.totalFlights : 0} starter</span>
                </Badge>
              </div>
            </div>
          </div>
        </CardHeader>
        
        <CardContent className="pt-4">
          {isYearLoading ? (
            <div className="w-full flex flex-col items-center justify-center py-12">
              <Loader2 className="h-14 w-14 animate-spin text-primary mb-5" />
              <p className="text-lg font-medium text-center">Indlæser årsstatistik...</p>
            </div>
          ) : (
            <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
              <TabsList className="w-full h-14 rounded-lg mb-4">
                <TabsTrigger 
                  value="summary" 
                  className="text-xs sm:text-base flex-1 h-full rounded-md data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                >
                  <BarChart2 className="h-4 w-4 sm:h-5 sm:w-5 sm:mr-2" />
                  <span className="hidden sm:inline">Oversigt</span>
                </TabsTrigger>
                <TabsTrigger 
                  value="flights" 
                  className="text-xs sm:text-base flex-1 h-full rounded-md data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                >
                  <Plane className="h-4 w-4 sm:h-5 sm:w-5 sm:mr-2" />
                  <span className="hidden sm:inline">Flyvninger</span>
                </TabsTrigger>
                <TabsTrigger 
                  value="pilots" 
                  className="text-xs sm:text-base flex-1 h-full rounded-md data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                >
                  <Users className="h-4 w-4 sm:h-5 sm:w-5 sm:mr-2" />
                  <span className="hidden sm:inline">Piloter</span>
                </TabsTrigger>
                <TabsTrigger 
                  value="aircraft" 
                  className="text-xs sm:text-base flex-1 h-full rounded-md data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                >
                  <Plane className="h-4 w-4 sm:h-5 sm:w-5 sm:mr-2" />
                  <span className="hidden sm:inline">Fly</span>
                </TabsTrigger>
              </TabsList>
              
              {/* Summary Tab */}
              <TabsContent value="summary" className="mt-0">
                {currentStats ? (
                  <>
                    <div className={`grid ${timeFrame === "today" && isCurrentDate(selectedDate) ? 'grid-cols-3' : 'grid-cols-1 sm:grid-cols-2'} gap-3`}>
                      <SummaryCard 
                        title="Starter i alt" 
                        value={currentStats.summary.totalFlights.toString()} 
                        icon={<BarChart2 className="h-6 w-6" />} 
                        color="text-blue-500"
                      />
                      {timeFrame === "today" && isCurrentDate(selectedDate) && (
                      <SummaryCard 
                        title="Piloter i luften" 
                        value={currentStats.summary.flightsInProgress.toString()} 
                        icon={<Users className="h-6 w-6" />} 
                        color="text-amber-500"
                      />
                      )}
                      <SummaryCard 
                        title="Flyvetid i alt" 
                        value={`${currentStats.summary.totalFlightTimeHours}:${currentStats.summary.totalFlightTimeRemainingMinutes.toString().padStart(2, '0')}`} 
                        icon={<Timer className="h-6 w-6" />} 
                        color="text-emerald-500"
                      />
                    </div>
                    
                    {/* Record Flights Section */}
                    {(currentStats.records || currentStats.longestFlight) && (
                      <div className="mt-6">
                        <h3 className="text-lg font-bold mb-3 flex items-center">
                          <Award className="h-5 w-5 mr-2 text-amber-500" />
                          Dagens top
                        </h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                          {/* Longest Flight Card */}
                          {currentStats.longestFlight && (
                            <div className="p-4 bg-gradient-to-r from-purple-50 to-purple-100 rounded-lg border border-purple-200">
                              <div className="flex items-center gap-3 mb-2">
                                <div className="flex items-center justify-center h-10 w-10 rounded-full bg-purple-100 border border-purple-300">
                                  <Timer className="h-5 w-5 text-purple-600" />
                                </div>
                                <span className="font-bold text-base">Længste flyvning</span>
                              </div>
                              
                              <div className="text-xl font-bold text-purple-700 mt-1 mb-2">
                                {currentStats.longestFlight.formattedDuration}
                              </div>
                              
                              <div className="text-sm font-medium">{currentStats.longestFlight.pilotName}
                                {currentStats.longestFlight.isGuestPilot && (
                                  <Badge className="ml-2 text-xs font-normal">Gæst</Badge>
                                )}
                              </div>
                              <div className="text-xs text-muted-foreground mt-1">
                                {currentStats.longestFlight.aircraftRegistration}
                              </div>
                            </div>
                          )}
                          
                          {/* Distance Record Card */}
                          {currentStats.records?.distance && (
                            <div className="p-4 bg-gradient-to-r from-emerald-50 to-emerald-100 rounded-lg border border-emerald-200">
                              <div className="flex items-center gap-3 mb-2">
                                <div className="flex items-center justify-center h-10 w-10 rounded-full bg-emerald-100 border border-emerald-300">
                                  <Ruler className="h-5 w-5 text-emerald-600" />
                                </div>
                                <span className="font-bold text-base">Længste distance</span>
                              </div>
                              
                              <div className="text-xl font-bold text-emerald-700 mt-1 mb-2">
                                {currentStats.records.distance.value.toFixed(1)} km
                              </div>
                              
                              <div className="text-sm font-medium">{currentStats.records.distance.pilotName}</div>
                              <div className="text-xs text-muted-foreground mt-1">
                                {currentStats.records.distance.aircraftRegistration}
                              </div>
                            </div>
                          )}
                          
                          {/* Altitude Record Card */}
                          {currentStats.records?.altitude && (
                            <div className="p-4 bg-gradient-to-r from-blue-50 to-blue-100 rounded-lg border border-blue-200">
                              <div className="flex items-center gap-3 mb-2">
                                <div className="flex items-center justify-center h-10 w-10 rounded-full bg-blue-100 border border-blue-300">
                                  <ArrowUp className="h-5 w-5 text-blue-600" />
                                </div>
                                <span className="font-bold text-base">Højeste højde</span>
                              </div>
                              
                              <div className="text-xl font-bold text-blue-700 mt-1 mb-2">
                                {currentStats.records.altitude.value.toFixed(0)} m
                              </div>
                              
                              <div className="text-sm font-medium">{currentStats.records.altitude.pilotName}</div>
                              <div className="text-xs text-muted-foreground mt-1">
                                {currentStats.records.altitude.aircraftRegistration}
                              </div>
                            </div>
                          )}
                          
                          {/* Speed Record Card */}
                          {currentStats.records?.speed && (
                            <div className="p-4 bg-gradient-to-r from-amber-50 to-amber-100 rounded-lg border border-amber-200">
                              <div className="flex items-center gap-3 mb-2">
                                <div className="flex items-center justify-center h-10 w-10 rounded-full bg-amber-100 border border-amber-300">
                                  <Wind className="h-5 w-5 text-amber-600" />
                                </div>
                                <span className="font-bold text-base">Højeste hastighed</span>
                              </div>
                              
                              <div className="text-xl font-bold text-amber-700 mt-1 mb-2">
                                {currentStats.records.speed.value.toFixed(0)} km/t
                              </div>
                              
                              <div className="text-sm font-medium">{currentStats.records.speed.pilotName}</div>
                              <div className="text-xs text-muted-foreground mt-1">
                                {currentStats.records.speed.aircraftRegistration}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                    
                    <div className="mt-6">
                      {currentStats.pilots.length > 0 ? (
                        <>
                          <h3 className="text-lg font-bold mb-3 flex items-center">
                            <Users className="h-5 w-5 mr-2 text-primary" />
                            Top piloter
                          </h3>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {currentStats.pilots.slice(0, 6).map(pilot => (
                              <div 
                                key={pilot.id} 
                                className="flex justify-between items-center p-3 bg-slate-50 rounded-lg border-l-4 border-blue-500 shadow-sm"
                              >
                                <div className="flex items-center">
                                  <div>
                                    <div className="text-base font-bold flex items-center">
                                      {pilot.name}
                                      {pilot.isGuest && 
                                        <Badge className="ml-2 text-xs font-normal">Gæst</Badge>
                                      }
                                    </div>
                                    <div className="text-sm text-muted-foreground mt-0.5 flex items-center">
                                      {pilot.flightCount} {pilot.flightCount === 1 ? 'start' : 'starter'}
                                      {pilot.instructorFlights > 0 && (
                                        <span className="flex items-center ml-2 text-emerald-700">
                                          <GraduationCap className="h-3 w-3 mr-1" />
                                          {pilot.instructorFlights} som instruktør
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                                <div className="flex items-center">
                                  <Badge variant="secondary" className="text-sm py-0.5 px-2">
                                    {formatTime(pilot.flightHours, pilot.flightMinutes)}
                                  </Badge>
                                </div>
                              </div>
                            ))}
                          </div>
                        </>
                      ) : (
                        <div className="text-center py-6 bg-slate-50 rounded-lg">
                          <Users className="h-10 w-10 mx-auto text-muted-foreground/60 mb-2" />
                          <p className="text-base text-muted-foreground">Ingen pilot-data for denne periode</p>
                        </div>
                      )}
                    </div>
                    
                    <div className="mt-6">
                      {currentStats.aircraft.length > 0 ? (
                        <>
                          <h3 className="text-lg font-bold mb-3 flex items-center">
                            <Plane className="h-5 w-5 mr-2 text-primary" />
                            Top fly
                          </h3>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {currentStats.aircraft.slice(0, 6).map(aircraft => (
                              <div 
                                key={aircraft.id} 
                                className="flex justify-between items-center p-3 bg-slate-50 rounded-lg border-l-4 border-amber-500 shadow-sm"
                              >
                                <div className="flex items-center">
                                  <div>
                                    <div className="text-base font-bold">
                                      {aircraft.registration}
                                    </div>
                                    <div className="text-sm text-muted-foreground mt-0.5 flex items-center">
                                      {aircraft.type} • {aircraft.flightCount} {aircraft.flightCount === 1 ? 'start' : 'starter'}
                                    </div>
                                  </div>
                                </div>
                                <div className="flex items-center">
                                  <Badge variant="secondary" className="text-sm py-0.5 px-2">
                                    {formatTime(aircraft.flightHours, aircraft.flightMinutes)}
                                  </Badge>
                                </div>
                              </div>
                            ))}
                          </div>
                        </>
                      ) : (
                        <div className="text-center py-6 bg-slate-50 rounded-lg">
                          <Plane className="h-10 w-10 mx-auto text-muted-foreground/60 mb-2" />
                          <p className="text-base text-muted-foreground">Ingen fly-data for denne periode</p>
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center py-12 bg-slate-50 rounded-lg">
                    <Info className="h-12 w-12 text-muted-foreground/40 mb-3" />
                    <p className="text-base text-muted-foreground">Ingen data fundet for den valgte dato</p>
                  </div>
                )}
              </TabsContent>
              
              {/* Flights Tab */}
              <TabsContent value="flights" className="mt-0">
                {currentStats && currentStats.flights && currentStats.flights.length > 0 ? (
                  <>
                    {/* Search, sort, and view mode controls */}
                    <div className="mb-4 p-3 bg-slate-50 rounded-lg shadow-sm flex flex-col gap-3">
                      <div className="flex flex-col sm:flex-row gap-3">
                        <div className="flex-1">
                          <label htmlFor="flight-search" className="text-sm font-medium mb-1 block">Søg efter pilot eller fly</label>
                          <input
                            id="flight-search"
                            type="text"
                            className="w-full h-10 px-3 rounded-md border border-slate-300"
                            value={flightSearchTerm}
                            onChange={(e) => setFlightSearchTerm(e.target.value)}
                            placeholder="Indtast navn eller registrering..."
                          />
                        </div>
                        <div className="sm:w-64">
                          <label htmlFor="flight-sort" className="text-sm font-medium mb-1 block">Sortér efter</label>
                          <select 
                            id="flight-sort"
                            className="w-full h-10 px-3 rounded-md border border-slate-300"
                            value={flightSortOption}
                            onChange={(e) => setFlightSortOption(e.target.value as any)}
                          >
                            <option value="takeoffTime">Tidligste starttid</option>
                            <option value="duration">Længste flyvetid</option>
                            <option value="distance">Længste distance</option>
                            <option value="altitude">Højeste højde</option>
                            <option value="speed">Højeste hastighed</option>
                          </select>
                        </div>
                      </div>
                      
                      {/* View mode toggle */}
                      <div className="flex items-center justify-end mt-2">
                        <div className="flex items-center space-x-2">
                          <span className="text-sm font-medium">Visningstilstand:</span>
                          <div className="flex bg-slate-200 rounded-lg p-0.5">
                            <button
                              onClick={() => setViewMode("card")}
                              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                                viewMode === "card" 
                                  ? "bg-white shadow-sm" 
                                  : "text-slate-600 hover:bg-slate-100"
                              }`}
                            >
                              Kortvisning
                            </button>
                            <button
                              onClick={() => setViewMode("table")}
                              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                                viewMode === "table" 
                                  ? "bg-white shadow-sm" 
                                  : "text-slate-600 hover:bg-slate-100"
                              }`}
                            >
                              Tabelvisning
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    {viewMode === "card" ? (
                      <div className="pb-8">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                          {getFilteredSortedFlights(currentStats.flights).map(flight => (
                        <div 
                          key={flight.id} 
                          className={`p-5 rounded-lg border shadow-sm h-full flex flex-col justify-between ${
                            flight.status === "in_flight" 
                              ? "bg-green-50 border-green-200" 
                              : flight.status === "completed" 
                                ? "bg-blue-50 border-blue-200"
                                : "bg-yellow-50 border-yellow-200"
                          }`}
                        >
                          {/* Header section with registration and status */}
                          <div className="flex justify-between items-start mb-3">
                            <div className="flex items-center gap-2">
                                  <span className="text-xl font-bold">
                                    {flight.registration} 
                              {flight.isSchoolFlight && (
                                      <span className="inline-flex ml-2 text-emerald-600">
                                        <GraduationCap className="h-5 w-5" />
                                      </span>
                                    )}
                                    <span className="text-sm font-normal text-muted-foreground ml-1">({flight.type})</span>
                                  </span>
                            </div>
                            <Badge 
                              variant={
                                flight.status === "in_flight" 
                                  ? "secondary" 
                                  : flight.status === "completed" 
                                    ? "default"
                                    : "outline"
                              }
                              className={`px-3 py-1.5 text-base ${flight.status === "in_flight" ? "bg-green-100 text-green-800 hover:bg-green-100" : ""}`}
                            >
                              {flight.status === "in_flight" 
                                ? "I luften" 
                                : flight.status === "completed" 
                                  ? "Afsluttet"
                                  : "Planlagt"
                              }
                            </Badge>
                          </div>
                          
                          {/* Aircraft and pilot info */}
                          <div>
                            <div className="flex items-center gap-1.5 mb-2">
                              <Users className="h-5 w-5 text-muted-foreground" />
                              <span className="text-base font-medium">{flight.pilot}</span>
                              {flight.coPilot && (
                                <span className="text-base text-muted-foreground ml-1">
                                  / {flight.coPilot}
                                </span>
                              )}
                            </div>
                            {/* Date display */}
                            <div className="flex items-center gap-1.5 mt-2">
                              <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                              <span className="text-sm text-muted-foreground">
                                {flight.date ? format(new Date(flight.date), 'dd. MMMM yyyy', { locale: da }) : 'Ingen dato'}
                              </span>
                            </div>
                          </div>
                          
                          {/* Time and distance info */}
                          <div className="grid grid-cols-2 gap-3 mt-3 pt-3 border-t border-slate-200">
                            <div className="flex flex-col">
                              <div className="text-sm text-muted-foreground mb-1 flex items-center">
                                <Clock className="h-4 w-4 mr-1.5" /> Start
                              </div>
                              <div className="text-base font-medium">{flight.takeoffTime}</div>
                            </div>
                            
                            <div className="flex flex-col">
                              <div className="text-sm text-muted-foreground mb-1 flex items-center">
                                <Clock className="h-4 w-4 mr-1.5" /> Slut
                              </div>
                              <div className="text-base font-medium">{flight.landingTime}</div>
                            </div>
                            
                            <div className="flex flex-col">
                              <div className="text-sm text-muted-foreground mb-1 flex items-center">
                                <Timer className="h-4 w-4 mr-1.5" /> Varighed
                              </div>
                              <div className="text-base font-medium">{flight.duration}</div>
                            </div>
                            
                            <div className="flex flex-col">
                              <div className="text-sm text-muted-foreground mb-1 flex items-center">
                                <Ruler className="h-4 w-4 mr-1.5" /> Distance
                              </div>
                              <div className="text-base font-medium">
                                {flight.distance ? `${flight.distance.toFixed(1)} km` : "-"}
                              </div>
                            </div>
                          </div>
                          
                          {/* Stats section: only show for completed flights with data */}
                          {flight.status === "completed" && (flight.maxAltitude || flight.maxSpeed) && (
                            <div className="grid grid-cols-2 gap-3 mt-3 pt-3 border-t border-slate-200">
                              {flight.maxAltitude && (
                                <div className="flex items-center gap-2">
                                  <div className="flex items-center justify-center h-9 w-9 rounded-full bg-blue-100">
                                    <ArrowUp className="h-5 w-5 text-blue-600" />
                                  </div>
                                  <div>
                                    <div className="text-sm text-muted-foreground">Max højde</div>
                                    <div className="text-base font-medium">{flight.maxAltitude.toFixed(0)} m</div>
                                  </div>
                                </div>
                              )}
                              
                              {flight.maxSpeed && (
                                <div className="flex items-center gap-2">
                                  <div className="flex items-center justify-center h-9 w-9 rounded-full bg-amber-100">
                                    <Wind className="h-5 w-5 text-amber-600" />
                                  </div>
                                  <div>
                                    <div className="text-sm text-muted-foreground">Max hastighed</div>
                                    <div className="text-base font-medium">{flight.maxSpeed.toFixed(0)} km/t</div>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                          
                          {/* Replay Button - Updated text and full width */}
                          <div className="mt-4 pt-3 border-t border-slate-200">
                            <Button 
                              variant="default"
                              size="lg"
                              className="gap-2 h-12 px-5 text-base font-medium w-full"
                              onClick={() => setSelectedFlightForReplay({ id: flight.id, registration: flight.registration })}
                            >
                              <Play className="h-5 w-5" />
                              Genafspil flyvning
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                      </div>
                    ) : (
                      /* Table View */
                      <div className="pb-8">
                        <div className="overflow-auto max-h-[60vh] sm:max-h-[500px] rounded-md border">
                          <div className="min-w-[800px]">
                            <table className="w-full text-sm border-collapse">
                              <thead className="sticky top-0 bg-slate-100 z-10">
                                <tr className="border-b border-slate-200">
                                  <th className="py-3 px-4 text-left font-medium text-slate-600 w-12">#</th>
                                  <th className="py-3 px-4 text-left font-medium text-slate-600 w-24">Dato</th>
                                  <th className="py-3 px-4 text-left font-medium text-slate-600 w-28">Reg</th>
                                  <th className="py-3 px-4 text-left font-medium text-slate-600">Pilot</th>
                                  <th className="py-3 px-4 text-left font-medium text-slate-600">2. Pilot / Instruktør</th>
                                  <th className="py-3 px-4 text-left font-medium text-slate-600 w-20">Metode</th>
                                  <th className="py-3 px-4 text-left font-medium text-slate-600">Start/Land</th>
                                  <th className="py-3 px-4 text-left font-medium text-slate-600 w-20">Start</th>
                                  <th className="py-3 px-4 text-left font-medium text-slate-600 w-20">Slut</th>
                                  <th className="py-3 px-4 text-left font-medium text-slate-600 w-16">Tid</th>
                                </tr>
                              </thead>
                              <tbody>
                                {getFilteredSortedFlights(currentStats.flights)
                                  .sort((a, b) => {
                                    // Special sort for table view - by takeoff time, earliest first
                                    if (a.takeoffTime === "-" && b.takeoffTime !== "-") return 1;
                                    if (a.takeoffTime !== "-" && b.takeoffTime === "-") return -1;
                                    if (a.takeoffTime === "-" && b.takeoffTime === "-") return 0;
                                    
                                    const timeA = a.takeoffTime.split(":"); 
                                    const timeB = b.takeoffTime.split(":");
                                    
                                    const hourA = parseInt(timeA[0]);
                                    const hourB = parseInt(timeB[0]);
                                    
                                    if (hourA !== hourB) return hourA - hourB;
                                    
                                    const minA = parseInt(timeA[1]);
                                    const minB = parseInt(timeB[1]);
                                    
                                    return minA - minB;
                                  })
                                  .map((flight, index) => (
                                  <tr 
                                    key={flight.id} 
                                    className={`
                                      border-b border-slate-200 
                                      ${flight.status === "in_flight" ? "bg-green-50" : ""}
                                      ${index % 2 === 0 ? "" : "bg-slate-50"}
                                    `}
                                  >
                                    <td className="py-3 px-4 text-center">{index + 1}</td>
                                    <td className="py-3 px-4">
                                      {flight.date ? format(new Date(flight.date), 'dd.MM.yy', { locale: da }) : '-'}
                                    </td>
                                    <td className="py-3 px-4">
                                      {flight.registration}
                                      {flight.isSchoolFlight && (
                                        <span className="inline-flex ml-2 text-emerald-600">
                                          <GraduationCap className="h-4 w-4" />
                                        </span>
                                      )}
                                    </td>
                                    <td className="py-3 px-4">{flight.pilot}</td>
                                    <td className="py-3 px-4">{flight.coPilot || "-"}</td>
                                    <td className="py-3 px-4">S</td>
                                    <td className="py-3 px-4">{flight.takeoffAirfield}/{flight.landingAirfield}</td>
                                    <td className="py-3 px-4 font-medium">{flight.takeoffTime}</td>
                                    <td className="py-3 px-4 font-medium">{flight.landingTime}</td>
                                    <td className="py-3 px-4 font-medium">{flight.duration}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center py-12 bg-slate-50 rounded-lg">
                    <Plane className="h-12 w-12 text-muted-foreground/40 mb-3" />
                    <p className="text-base text-muted-foreground">Ingen flyvninger for denne periode</p>
                  </div>
                )}
              </TabsContent>
              
              {/* Pilots Tab */}
              <TabsContent value="pilots" className="mt-0">
                {currentStats && currentStats.pilots && currentStats.pilots.length > 0 ? (
                  <>
                    {/* Search, sort, and view mode controls */}
                    <div className="mb-4 p-3 bg-slate-50 rounded-lg shadow-sm flex flex-col gap-3">
                      <div className="flex flex-col sm:flex-row gap-3">
                        <div className="flex-1">
                          <label htmlFor="pilot-search" className="text-sm font-medium mb-1 block">Søg efter pilot</label>
                          <input
                            id="pilot-search"
                            type="text"
                            className="w-full h-10 px-3 rounded-md border border-slate-300"
                            value={pilotSearchTerm}
                            onChange={(e) => setPilotSearchTerm(e.target.value)}
                            placeholder="Indtast navn..."
                          />
                        </div>
                        <div className="sm:w-64">
                          <label htmlFor="pilot-sort" className="text-sm font-medium mb-1 block">Sortér efter</label>
                          <select 
                            id="pilot-sort"
                            className="w-full h-10 px-3 rounded-md border border-slate-300"
                            value={pilotSortOption}
                            onChange={(e) => setPilotSortOption(e.target.value as any)}
                          >
                            <option value="flightCount">Flest starter</option>
                            <option value="flightTime">Længste flyvetid</option>
                            <option value="name">Navn (A-Å)</option>
                          </select>
                        </div>
                      </div>
                      
                      {/* View mode toggle */}
                      <div className="flex items-center justify-end mt-2">
                        <div className="flex items-center space-x-2">
                          <span className="text-sm font-medium">Visningstilstand:</span>
                          <div className="flex bg-slate-200 rounded-lg p-0.5">
                            <button
                              onClick={() => setViewMode("card")}
                              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                                viewMode === "card" 
                                  ? "bg-white shadow-sm" 
                                  : "text-slate-600 hover:bg-slate-100"
                              }`}
                            >
                              Kortvisning
                            </button>
                            <button
                              onClick={() => setViewMode("table")}
                              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                                viewMode === "table" 
                                  ? "bg-white shadow-sm" 
                                  : "text-slate-600 hover:bg-slate-100"
                              }`}
                            >
                              Tabelvisning
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    {viewMode === "card" ? (
                      <div className="pb-8">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                          {getFilteredSortedPilots(currentStats.pilots).map(pilot => (
                        <div 
                          key={pilot.id} 
                          className="bg-white rounded-xl border border-slate-200 shadow-md overflow-hidden cursor-pointer"
                          onClick={() => {
                            // Only open dialog on desktop/tablet
                            if (window.innerWidth >= 768) {
                              setSelectedPilotForDetails(pilot);
                            }
                          }}
                        >
                          {/* Decorative accent */}
                          <div className="h-1 bg-gradient-to-r from-blue-500 to-emerald-500" />
                          
                          {/* Header */}
                          <div className="bg-gradient-to-r from-slate-50 to-white px-4 py-3 border-b border-slate-200">
                            <div className="flex items-center gap-2">
                              <Users className="h-5 w-5 text-slate-600" />
                              <span className="text-lg font-bold text-slate-900">{pilot.name}</span>
                              {pilot.isGuest && 
                                <Badge className="ml-2 text-xs">Gæst</Badge>
                              }
                            </div>
                          </div>

                          {/* Main content */}
                          <div className="p-4 space-y-4">
                            {/* Top row: Basic stats */}
                            <div className="grid grid-cols-2 gap-4">
                              <div className="text-center">
                                <div className="text-2xl sm:text-3xl font-bold text-blue-600">{pilot.flightCount}</div>
                                <div className="text-sm font-medium text-slate-600 uppercase tracking-wide">
                                  {pilot.flightCount === 1 ? 'Start' : 'Starter'}
                                </div>
                              </div>
                              <div className="text-center">
                                <div className="text-xl sm:text-2xl font-bold text-slate-700">
                                  {formatTime(pilot.flightHours, pilot.flightMinutes)}
                                </div>
                                <div className="text-sm font-medium text-slate-600 uppercase tracking-wide">Tid</div>
                              </div>
                            </div>

                            {/* Start breakdown - only show categories with actual flights */}
                            {(pilot.instructorFlights > 0 || pilot.soloFlights > 0 || pilot.studentFlights > 0) && (
                              <div className="bg-slate-50 rounded-lg p-3">
                                <div className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">Start fordeling</div>
                                <div className={`grid gap-2 ${
                                  // Determine grid columns based on how many categories have values
                                  [pilot.instructorFlights > 0, pilot.soloFlights > 0, pilot.studentFlights > 0].filter(Boolean).length === 3 
                                    ? 'grid-cols-3' 
                                    : [pilot.instructorFlights > 0, pilot.soloFlights > 0, pilot.studentFlights > 0].filter(Boolean).length === 2
                                    ? 'grid-cols-2'
                                    : 'grid-cols-1'
                                }`}>
                                  {pilot.instructorFlights > 0 && (
                                    <div className="text-center">
                                      <div className="text-lg font-bold text-emerald-600">{pilot.instructorFlights}</div>
                                      <div className="text-xs text-emerald-600 font-medium">Instruktør</div>
                                    </div>
                                  )}
                                  {pilot.soloFlights > 0 && (
                                    <div className="text-center">
                                      <div className="text-lg font-bold text-blue-600">{pilot.soloFlights}</div>
                                      <div className="text-xs text-blue-600 font-medium">Alene</div>
                                    </div>
                                  )}
                                  {pilot.studentFlights > 0 && (
                                    <div className="text-center">
                                      <div className="text-lg font-bold text-amber-600">{pilot.studentFlights}</div>
                                      <div className="text-xs text-amber-600 font-medium">Elev</div>
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}

                            {/* Flight time breakdown - only show if both categories exist */}
                            {pilot.instructorTimeMinutes > 0 && pilot.normalTimeMinutes > 0 && (
                              <div className="bg-slate-50 rounded-lg p-3">
                                <div className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">Flyvetid fordeling</div>
                                <div className="grid grid-cols-2 gap-3">
                                  <div className="text-center">
                                    <div className="text-lg font-bold text-emerald-600">{pilot.instructorTime}</div>
                                    <div className="text-xs text-emerald-600 font-medium">Instruktør</div>
                                  </div>
                                  <div className="text-center">
                                    <div className="text-lg font-bold text-blue-600">{pilot.normalTime}</div>
                                    <div className="text-xs text-blue-600 font-medium">Normal</div>
                                  </div>
                                </div>
                              </div>
                            )}

                            {/* Performance stats */}
                            <div className="grid grid-cols-3 gap-4 pt-2 border-t border-slate-200">
                              <div className="text-center">
                                <div className="text-sm font-bold text-slate-700">
                                  {pilot.totalDistance && pilot.totalDistance > 0 ? 
                                    `${pilot.totalDistance.toFixed(1)} km` : 
                                    "-"
                                  }
                                </div>
                                <div className="text-xs text-slate-500">Distance</div>
                              </div>
                              <div className="text-center">
                                <div className="text-sm font-bold text-slate-700">
                                  {pilot.maxAltitude && pilot.maxAltitude > 0 ? 
                                    `${pilot.maxAltitude.toFixed(0)} m` : 
                                    "-"
                                  }
                                </div>
                                <div className="text-xs text-slate-500">Max højde</div>
                              </div>
                              <div className="text-center">
                                <div className="text-sm font-bold text-slate-700">
                                  {pilot.maxSpeed && pilot.maxSpeed > 0 ? 
                                    `${pilot.maxSpeed.toFixed(0)} km/t` : 
                                    "-"
                                  }
                                </div>
                                <div className="text-xs text-slate-500">Max hastighed</div>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                      </div>
                    ) : (
                      /* Table View for Pilots */
                      <div className="pb-8">
                        <div className="overflow-auto max-h-[60vh] sm:max-h-[500px] rounded-md border">
                          <div className="min-w-[800px]">
                            <table className="w-full text-sm border-collapse">
                              <thead className="sticky top-0 bg-slate-100 z-10">
                                <tr className="border-b border-slate-200">
                                  <th className="py-3 px-4 text-left font-medium text-slate-600 w-48">Pilot</th>
                                  <th className="py-3 px-4 text-left font-medium text-slate-600 w-24">Starter</th>
                                  <th className="py-3 px-4 text-left font-medium text-slate-600 w-48">Flyvetid</th>
                                  <th className="py-3 px-4 text-left font-medium text-slate-600 w-28">Skoleflyvninger</th>
                                  <th className="py-3 px-4 text-left font-medium text-slate-600 w-28">Distance</th>
                                  <th className="py-3 px-4 text-left font-medium text-slate-600 w-24">Max højde</th>
                                  <th className="py-3 px-4 text-left font-medium text-slate-600 w-32">Max hastighed</th>
                                </tr>
                              </thead>
                              <tbody>
                                {getFilteredSortedPilots(currentStats.pilots).map((pilot, index) => (
                                  <tr 
                                    key={pilot.id} 
                                    className={`border-b border-slate-200 cursor-pointer hover:bg-slate-100 transition-colors ${index % 2 === 0 ? "" : "bg-slate-50"}`}
                                    onClick={() => {
                                      // Only open dialog on desktop/tablet
                                      if (window.innerWidth >= 768) {
                                        setSelectedPilotForDetails(pilot);
                                      }
                                    }}
                                  >
                                    <td className="py-3 px-4 font-medium">
                                      {pilot.name}
                                      {pilot.isGuest && <span className="ml-2 text-xs text-slate-500">(Gæst)</span>}
                                    </td>
                                    <td className="py-3 px-4 font-medium">
                                      <div className="flex flex-col">
                                        <div className="font-bold text-lg text-slate-900">
                                          {pilot.flightCount}
                                        </div>
                                        {/* Only show breakdown if pilot has BOTH instructor and solo starts */}
                                        {pilot.instructorFlights > 0 && pilot.soloFlights > 0 && (
                                          <div className="mt-2 space-y-1 text-sm">
                                            <div className="flex items-center gap-2">
                                              <span className="font-medium text-emerald-700">Instruktør:</span>
                                              <span className="font-medium">{pilot.instructorFlights}</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                              <span className="font-medium text-blue-700">Alene:</span>
                                              <span className="font-medium">{pilot.soloFlights}</span>
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    </td>
                                    <td className="py-3 px-4 font-medium">
                                      <div className="flex flex-col">
                                        <div className="font-bold text-lg text-slate-900">
                                          {formatTime(pilot.flightHours, pilot.flightMinutes)}
                                        </div>
                                        {/* Only show breakdown if pilot has BOTH instructor and normal time */}
                                        {pilot.instructorTimeMinutes > 0 && pilot.normalTimeMinutes > 0 && (
                                          <div className="mt-2 space-y-1 text-sm">
                                            <div className="flex items-center gap-2">
                                              <span className="font-medium text-emerald-700">Instruktør:</span>
                                              <span className="font-medium">{pilot.instructorTime}</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                              <span className="font-medium text-blue-700">Alene:</span>
                                              <span className="font-medium">{pilot.normalTime}</span>
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    </td>
                                    <td className="py-3 px-4">
                                      <div className="space-y-1">
                                        {pilot.instructorFlights > 0 && (
                                          <div className="flex items-center">
                                            <GraduationCap className="h-4 w-4 mr-1.5 text-emerald-600" />
                                            <span className="text-sm font-medium">{pilot.instructorFlights} starter som instruktør</span>
                                          </div>
                                        )}
                                        {pilot.studentFlights > 0 && (
                                          <div className="flex items-center">
                                            <GraduationCap className="h-4 w-4 mr-1.5 text-blue-600" />
                                            <span className="text-sm font-medium">{pilot.studentFlights} starter som elev</span>
                                          </div>
                                        )}
                                        {pilot.instructorFlights === 0 && pilot.studentFlights === 0 && (
                                          "-"
                                        )}
                                      </div>
                                    </td>
                                    <td className="py-3 px-4">
                                      {pilot.totalDistance && pilot.totalDistance > 0 ? 
                                        `${pilot.totalDistance.toFixed(1)} km` : 
                                        "-"
                                      }
                                    </td>
                                    <td className="py-3 px-4">
                                      {pilot.maxAltitude && pilot.maxAltitude > 0 ? 
                                        `${pilot.maxAltitude.toFixed(0)} m` : 
                                        "-"
                                      }
                                    </td>
                                    <td className="py-3 px-4">
                                      {pilot.maxSpeed && pilot.maxSpeed > 0 ? 
                                        `${pilot.maxSpeed.toFixed(0)} km/t` : 
                                        "-"
                                      }
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center py-12 bg-slate-50 rounded-lg">
                    <Users className="h-12 w-12 text-muted-foreground/40 mb-3" />
                    <p className="text-base text-muted-foreground">Ingen pilot-data for denne periode</p>
                  </div>
                )}
              </TabsContent>
              
              {/* Aircraft Tab */}
              <TabsContent value="aircraft" className="mt-0">
                {currentStats && currentStats.aircraft && currentStats.aircraft.length > 0 ? (
                  <>
                    {/* View mode toggle */}
                    <div className="mb-4 p-3 bg-slate-50 rounded-lg shadow-sm">
                      <div className="flex items-center justify-end">
                        <div className="flex items-center space-x-2">
                          <span className="text-sm font-medium">Visningstilstand:</span>
                          <div className="flex bg-slate-200 rounded-lg p-0.5">
                            <button
                              onClick={() => setViewMode("card")}
                              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                                viewMode === "card" 
                                  ? "bg-white shadow-sm" 
                                  : "text-slate-600 hover:bg-slate-100"
                              }`}
                            >
                              Kortvisning
                            </button>
                            <button
                              onClick={() => setViewMode("table")}
                              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                                viewMode === "table" 
                                  ? "bg-white shadow-sm" 
                                  : "text-slate-600 hover:bg-slate-100"
                              }`}
                            >
                              Tabelvisning
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  
                    {viewMode === "card" ? (
                      <div className="pb-8">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {currentStats.aircraft.map(aircraft => (
                        <div 
                          key={aircraft.id} 
                          className="flex flex-col p-3 bg-slate-50 rounded-lg border-l-4 border-amber-500 shadow-sm"
                        >
                          <div className="flex justify-between items-start">
                            <div className="flex items-center">
                              <Plane className="h-6 w-6 text-amber-500 mr-3" />
                              <div>
                                <div className="text-base font-bold">
                                  {aircraft.registration}
                                </div>
                                <div className="text-sm text-muted-foreground mt-0.5 flex items-center">
                                  {aircraft.type} • {aircraft.flightCount} {aircraft.flightCount === 1 ? 'start' : 'starter'}
                                </div>
                              </div>
                            </div>
                          </div>
                          
                            <div className="mt-2 pt-2 border-t border-slate-200">
                                <div className="flex flex-col space-y-2">
                                  <div className="flex items-center text-blue-600">
                                    <Timer className="h-4 w-4 mr-1.5" />
                                    <span className="text-sm font-medium">
                                      Total flyvetid: {formatTime(aircraft.flightHours, aircraft.flightMinutes)}
                                    </span>
                                  </div>
                                  
                                  {aircraft.schoolFlightCount > 0 && (
                                    <div className="flex items-center text-emerald-700 ml-6">
                                <GraduationCap className="h-4 w-4 mr-1.5" />
                                <span className="text-sm">
                                        Heraf {aircraft.schoolFlightCount} {aircraft.schoolFlightCount === 1 ? 'skoleflyvning' : 'skoleflyvninger'}
                                </span>
                            </div>
                          )}
                                </div>
                              </div>
                        </div>
                      ))}
                    </div>
                      </div>
                    ) : (
                      /* Table View for Aircraft */
                      <div className="pb-8">
                        <div className="overflow-auto max-h-[60vh] sm:max-h-[500px] rounded-md border">
                          <div className="min-w-[600px]">
                            <table className="w-full text-sm border-collapse">
                              <thead className="sticky top-0 bg-slate-100 z-10">
                                <tr className="border-b border-slate-200">
                                  <th className="py-3 px-4 text-left font-medium text-slate-600">Registrering</th>
                                  <th className="py-3 px-4 text-left font-medium text-slate-600">Type</th>
                                  <th className="py-3 px-4 text-left font-medium text-slate-600">Starter</th>
                                  <th className="py-3 px-4 text-left font-medium text-slate-600">Total flyvetid</th>
                                  <th className="py-3 px-4 text-left font-medium text-slate-600">Skoleflyvninger</th>
                                </tr>
                              </thead>
                              <tbody>
                                {currentStats.aircraft.map((aircraft, index) => (
                                  <tr 
                                    key={aircraft.id} 
                                    className={`border-b border-slate-200 ${index % 2 === 0 ? "" : "bg-slate-50"}`}
                                  >
                                    <td className="py-3 px-4 font-medium">{aircraft.registration}</td>
                                    <td className="py-3 px-4">{aircraft.type}</td>
                                    <td className="py-3 px-4">{aircraft.flightCount}</td>
                                    <td className="py-3 px-4 font-medium">
                                      {formatTime(aircraft.flightHours, aircraft.flightMinutes)}
                                    </td>
                                    <td className="py-3 px-4">
                                      {aircraft.schoolFlightCount > 0 ? (
                                        <div className="flex items-center">
                                          <GraduationCap className="h-4 w-4 mr-1.5 text-emerald-600" />
                                          <span>
                                            {aircraft.schoolFlightCount} {aircraft.schoolFlightCount === 1 ? 'skoleflyvning' : 'skoleflyvninger'}
                                          </span>
                                        </div>
                                      ) : "-"}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center py-12 bg-slate-50 rounded-lg">
                    <Plane className="h-12 w-12 text-muted-foreground/40 mb-3" />
                    <p className="text-base text-muted-foreground">Ingen fly-data for denne periode</p>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          )}
        </CardContent>
      </Card>

      {/* Replay Dialog */}
      {selectedFlightForReplay && (
        <StatisticsReplayMap 
          flightLogbookId={selectedFlightForReplay.id}
          aircraftRegistration={selectedFlightForReplay.registration}
          onClose={() => setSelectedFlightForReplay(null)}
        />
      )}
      
      {/* Pilot Details Dialog */}
      {selectedPilotForDetails && currentStats && (
        <PilotDetailsDialog
          isOpen={!!selectedPilotForDetails}
          onClose={() => setSelectedPilotForDetails(null)}
          pilotName={selectedPilotForDetails.name}
          pilotId={selectedPilotForDetails.id}
          flights={currentStats.flights}
          totalFlights={selectedPilotForDetails.flightCount}
          totalTimeMinutes={selectedPilotForDetails.flightTimeMinutes}
          instructorFlights={selectedPilotForDetails.instructorFlights}
          soloFlights={selectedPilotForDetails.soloFlights}
          studentFlights={selectedPilotForDetails.studentFlights}
        />
      )}
    </div>
  )
}

// Summary card component
function SummaryCard({ title, value, icon, color }: { 
  title: string; 
  value: string; 
  icon: React.ReactNode;
  color: string;
}) {
  return (
    <Card className="bg-white shadow-sm">
      <CardContent className="p-4">
        <div className="flex flex-col items-center text-center">
          <div className={`mb-2 ${color}`}>
            {icon}
          </div>
          <div className="text-3xl font-bold">{value}</div>
          <div className="text-sm text-muted-foreground mt-1">{title}</div>
        </div>
      </CardContent>
    </Card>
  )
}

// Wrap the page content with Suspense
export default function StatisticsPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen w-full flex-col bg-background">
        <div className="flex h-screen items-center justify-center">
          <Loader2 className="mr-2 h-6 w-6 animate-spin" />
          <span>Indlæser statistikker...</span>
        </div>
      </div>
    }>
      <StatisticsPageContent />
    </Suspense>
  );
}

// Main component using the context
function StatisticsPageContent() {
  const {
    // WebSocket state
    wsConnected,
    isAuthenticatedOnWs,
    pingStatus,
    authenticatedChannel,
    socketRef,

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
        
        {/* Add padding to content to account for fixed header height */}
        <div className="h-[calc(3rem+2.5rem)] md:h-[var(--fixed-header-total-height)] flex-shrink-0"></div>
        
        {/* Main content */}
        <div className="flex-1 p-2 pt-4 sm:p-3 m-0 overflow-auto">
          <Statistics 
            socket={socketRef.current}
            wsConnected={wsConnected}
            authenticatedChannel={authenticatedChannel}
          />
        </div>
      </main>
    </div>
  )
} 