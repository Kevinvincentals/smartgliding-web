"use client"

import { useState, useEffect, useRef, useMemo } from "react"
import { Loader2, Plus, Calendar as CalendarIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { TooltipProvider } from "@/components/ui/tooltip"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { format } from "date-fns"
import { da } from "date-fns/locale"
import { HistoricalFlightCard } from "@/components/flights/historical-flight-card"
import { EmptyFlightList } from "@/components/flights/empty-flight-list"
import { HistoricalAddFlightDialog } from "@/components/settings/historical-add-flight-dialog"
import { EditFlightDialog } from "@/components/flights/edit-flight-dialog"
import { TimePickerDialog } from "@/components/time-picker-dialog"
import { useToast } from "@/components/ui/use-toast"
import { formatUTCToLocalTime } from "@/lib/time-utils"
import type { Flight, Aircraft, Pilot, AirfieldOption, LaunchMethod } from "@/types/flight"
import type { FlightStatus } from "@/types/flight"

interface HistoricalFlightsProps {
  isLoading?: boolean;
}

// Add these types at the top of the file
type FlarmStatus = 'online' | 'offline' | 'unknown';
type FlarmStatuses = Record<string, FlarmStatus>;

export function HistoricalFlights({ isLoading = false }: HistoricalFlightsProps) {
  const [selectedDate, setSelectedDate] = useState<Date>(() => {
    // Default to yesterday's date
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    return yesterday;
  });
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [flights, setFlights] = useState<Flight[]>([]);
  const [isLoadingFlights, setIsLoadingFlights] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [airfieldOptions, setAirfieldOptions] = useState<AirfieldOption[]>([]);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editFlight, setEditFlight] = useState<Flight | null>(null);
  const [isTimePickerOpen, setIsTimePickerOpen] = useState(false);
  const [timeEditType, setTimeEditType] = useState<"start" | "end">("start");
  const [timeEditFlightId, setTimeEditFlightId] = useState<number | null>(null);
  const { toast } = useToast();
  const [datesWithFlights, setDatesWithFlights] = useState<Date[]>([]);
  
  // Mock FLARM status since WebSocket is not available for historical data
  const [flarmStatuses] = useState<FlarmStatuses>({});

  // Helper function for simple sorting 
  const simpleSortFlights = (flightsToSort: any[]): any[] => {
    return [...flightsToSort].sort((a, b) => {
      // Simple sort by status priority
      const getStatusPriority = (flight: any) => {
        const status = flight.status;
        if (status === 'pending') return 1;
        if (status === 'in_flight') return 2;
        if (status === 'completed') return 3;
        return 4;
      };
      
      const aPriority = getStatusPriority(a);
      const bPriority = getStatusPriority(b);
      
      if (aPriority !== bPriority) {
        return aPriority - bPriority;
      }
      
      // Within same status, sort by time
      if (a.status === 'pending') {
        return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
      } else {
        const aTime = a.startTime ? new Date(`1970-01-01T${a.startTime}:00Z`).getTime() : 0;
        const bTime = b.startTime ? new Date(`1970-01-01T${b.startTime}:00Z`).getTime() : 0;
        
        if (aTime !== bTime) {
          return aTime - bTime;
        }
        
        // Use createdAt as tiebreaker
        const aCreatedTime = new Date(a.createdAt || 0).getTime();
        const bCreatedTime = new Date(b.createdAt || 0).getTime();
        return aCreatedTime - bCreatedTime;
      }
    });
  };

  // New function to create numbering-based display order
  const createDisplayOrder = (flights: any[]): any[] => {
    // Separate flights into three categories
    const pendingFlights = flights.filter(f => f.status === 'pending');
    const normalFlights = flights.filter(f => f.status !== 'pending' && f.startTime); // Has takeoff time
    const landingOnlyFlights = flights.filter(f => f.status !== 'pending' && !f.startTime); // No takeoff but has landing
    
    // Sort normal flights by takeoff time with createdAt tiebreaker
    const sortedNormalFlights = normalFlights.sort((a, b) => {
      const aTime = new Date(`1970-01-01T${a.startTime}:00Z`).getTime();
      const bTime = new Date(`1970-01-01T${b.startTime}:00Z`).getTime();
      
      // Sort by takeoff time first
      if (aTime !== bTime) {
        return aTime - bTime; // Earliest takeoff first
      }
      
      // Same takeoff time: use originalId for deterministic ordering
      if (a.originalId && b.originalId) {
        return a.originalId.localeCompare(b.originalId);
      }
      
      // Fallback to createdAt if no originalId
      const aCreatedTime = new Date(a.createdAt || 0).getTime();
      const bCreatedTime = new Date(b.createdAt || 0).getTime();
      return aCreatedTime - bCreatedTime;
    });
    
    // Sort landing-only flights by landing time, then by originalId for stability
    const sortedLandingOnlyFlights = landingOnlyFlights.sort((a, b) => {
      // First try to sort by landing time if both have it
      if (a.endTime && b.endTime) {
        const aTime = new Date(`1970-01-01T${a.endTime}:00Z`).getTime();
        const bTime = new Date(`1970-01-01T${b.endTime}:00Z`).getTime();
        if (aTime !== bTime) {
          return aTime - bTime;
        }
      }
      
      // Use originalId for deterministic ordering
      if (a.originalId && b.originalId) {
        return a.originalId.localeCompare(b.originalId);
      }
      
      // Fallback to createdAt
      const aCreatedTime = new Date(a.createdAt || 0).getTime();
      const bCreatedTime = new Date(b.createdAt || 0).getTime();
      return aCreatedTime - bCreatedTime;
    });
    
    // Sort pending flights by creation time, but use originalId for stability when times are close
    const sortedPending = pendingFlights.sort((a, b) => {
      const aCreatedTime = new Date(a.createdAt || 0).getTime();
      const bCreatedTime = new Date(b.createdAt || 0).getTime();
      
      // If created within 1 second of each other, use originalId for deterministic ordering
      if (Math.abs(aCreatedTime - bCreatedTime) < 1000 && a.originalId && b.originalId) {
        return b.originalId.localeCompare(a.originalId); // Reverse for newest first in pending
      }
      
      return bCreatedTime - aCreatedTime; // Newest first for pending
    });
    
    // Add sequential numbering
    const numberedFlights: any[] = [];
    
    // Number normal flights first (earliest takeoff = #1)
    sortedNormalFlights.forEach((flight, index) => {
      numberedFlights.push({
        ...flight,
        sequentialNumber: index + 1
      });
    });
    
    // Number landing-only flights next (get numbers after normal flights)
    sortedLandingOnlyFlights.forEach((flight, index) => {
      numberedFlights.push({
        ...flight,
        sequentialNumber: sortedNormalFlights.length + index + 1
      });
    });
    
    // Number pending flights with highest numbers
    sortedPending.forEach((flight, index) => {
      numberedFlights.push({
        ...flight,
        sequentialNumber: sortedNormalFlights.length + sortedLandingOnlyFlights.length + sortedPending.length - index
      });
    });
    
    // Now sort for display: by sequential number (highest first)
    return numberedFlights.sort((a, b) => b.sequentialNumber - a.sequentialNumber);
  };

  // Fetch airfield options
  useEffect(() => {
    const fetchAirfields = async () => {
      try {
        const response = await fetch('/api/tablet/fetch_club_fields');
        if (response.ok) {
          const data = await response.json();
          if (data.success && data.airfieldOptions) {
            setAirfieldOptions(data.airfieldOptions);
          }
        }
      } catch (error) {
        console.error('Error fetching airfields:', error);
      }
    };

    fetchAirfields();
  }, []);

  // Fetch dates with flight activity for the current month
  useEffect(() => {
    const fetchFlightActivityDates = async () => {
      try {
        const year = selectedDate.getFullYear();
        const month = selectedDate.getMonth() + 1; // 1-12

        const response = await fetch(`/api/tablet/flight_activity_dates?year=${year}&month=${month}`);
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
  }, [selectedDate.getFullYear(), selectedDate.getMonth()]);

  // Fetch flights for the selected date
  const fetchFlightsForDate = async (date: Date) => {
    if (!date) return;

    setIsLoadingFlights(true);
    setError(null);

    try {
      // Format the date in YYYY-MM-DD format without timezone issues
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const formattedDate = `${year}-${month}-${day}`;

      const response = await fetch(`/api/tablet/fetch_historical_flights?date=${formattedDate}&includeDeleted=true`);
      if (!response.ok) {
        throw new Error('Failed to fetch flights');
      }

      const data = await response.json();
      if (data.success && data.flights) {
        // Transform API flights to match the expected Flight interface
        const transformedFlights = data.flights.map((apiFlight: any): Flight => {
          // Format times using our utility function for consistent timezone handling
          const formatTime = (dateString: string | null) => {
            return formatUTCToLocalTime(dateString);
          }
          
          // Create aircraft object
          const aircraft: Aircraft = {
            id: apiFlight.plane?.id ? parseInt(apiFlight.plane.id.substring(0, 8), 16) : Math.floor(Math.random() * 1000),
            registration: apiFlight.registration || apiFlight.plane?.registration_id || 'Unknown',
            type: apiFlight.type || apiFlight.plane?.type || 'Unknown',
            isDoubleSeater: apiFlight.plane?.is_twoseater || false,
            hasFlarm: false, // Will be updated below
            flarmId: undefined, // Using undefined instead of null
          }
          
          // Get FLARM ID from either the flight directly or the plane
          const flarmId = apiFlight.flarm_id || (apiFlight.plane?.flarm_id || null);
          // Use the has_valid_flarm flag from the API if available, otherwise check locally
          const hasValidFlarm = apiFlight.plane?.has_valid_flarm ?? 
            (flarmId && flarmId !== 'none' && flarmId !== 'unknown');
          
          // Update the aircraft object with FLARM data
          aircraft.flarmId = flarmId;
          aircraft.hasFlarm = hasValidFlarm;
          
          // Create pilot objects - handle both regular and guest pilots
          const createPilotObj = (pilotData: any, guestPilotName: string | null | undefined): Pilot | null => {
            // First check for regular pilot data
            if (pilotData && pilotData.firstname && pilotData.lastname) {
              return {
                id: pilotData.id,
                name: `${pilotData.firstname} ${pilotData.lastname}`
              }
            }
            
            // Then check for guest pilot name field
            if (guestPilotName) {
              return {
                id: 'guest',
                name: guestPilotName
              }
            }
            
            // If neither exists, return null
            return null
          }
          
          // Only create pilot objects when actual data exists (including guest pilots)
          const pilot = createPilotObj(apiFlight.pilot1, apiFlight.guest_pilot1_name);
          const coPilot = createPilotObj(apiFlight.pilot2, apiFlight.guest_pilot2_name);
          
          // Check if flight is deleted
          const isDeleted = apiFlight.deleted === true;
          
          // Map API status to UI status - ensure it's one of the allowed values
          let status: 'completed' | 'pending' | 'in_flight' | 'deleted' = 'pending';
          if (isDeleted) status = 'deleted';
          else if (apiFlight.status === 'completed' || apiFlight.status === 'COMPLETED') status = 'completed';
          else if (apiFlight.status === 'in_flight' || apiFlight.status === 'INFLIGHT') status = 'in_flight';
          else if (apiFlight.status === 'LANDED' && apiFlight.landing_time) status = 'completed';
          else if (apiFlight.status === 'landing_only') status = 'completed';
          // If the flight has a takeoff time but no landing time, mark it as in flight regardless of status
          else if (apiFlight.takeoff_time && !apiFlight.landing_time) status = 'in_flight';
          // If the flight has both takeoff and landing times, mark it as completed regardless of status
          else if (apiFlight.takeoff_time && apiFlight.landing_time) status = 'completed';
          else if (apiFlight.status === 'pending' || apiFlight.status === 'PENDING' || !apiFlight.status) status = 'pending';
          
          return {
            id: parseInt(apiFlight.id.substring(0, 8), 16),
            originalId: apiFlight.id,
            aircraft,
            pilot,
            coPilot,
            startTime: formatTime(apiFlight.takeoff_time),
            endTime: formatTime(apiFlight.landing_time),
            status,
            distance: apiFlight.flight_distance || 0,
            isSchoolFlight: apiFlight.is_school_flight || false,
            startField: apiFlight.takeoff_airfield || 'Unknown',
            landingField: apiFlight.landing_airfield || null,
            launchMethod: apiFlight.launch_method || 'S',
            notes: apiFlight.notes || null,
            deleted: isDeleted,
            createdAt: apiFlight.createdAt, // Add createdAt field for consistent sorting
            isPrivatePlane: apiFlight.isPrivatePlane || false, // Pass through the private plane status
            planeId: apiFlight.planeId || null // Pass through the MongoDB ObjectId for the plane
          }
        });
        
        setFlights(transformedFlights);
      } else {
        setError(data.error || 'Failed to fetch flights');
      }
    } catch (err) {
      setError('Failed to fetch flights');
      console.error('Error fetching flights:', err);
    } finally {
      setIsLoadingFlights(false);
    }
  };

  // Trigger fetch when date changes
  useEffect(() => {
    if (selectedDate) {
      fetchFlightsForDate(selectedDate);
    }
  }, [selectedDate]);



  const handleEditClick = (flight: Flight) => {
    const flightToEdit = { 
      ...flight,
      pilot: flight.pilot && flight.pilot.name !== 'Unknown Pilot' ? flight.pilot : null,
      coPilot: flight.coPilot && flight.coPilot.name !== 'Unknown Pilot' ? flight.coPilot : null,
      status: flight.status || 'pending'
    };
    
    setEditFlight(flightToEdit);
    setIsEditDialogOpen(true);
  };

  const handleSaveEdit = (updatedFlight: Flight) => {
    // Update local state
    setFlights(
      flights.map((flight) => {
        if (flight.id === updatedFlight.id) {
          return JSON.parse(JSON.stringify(updatedFlight));
        }
        return flight;
      })
    );
    
    // Save to server
    saveFlightToServer(updatedFlight);
  };

  const handleDeleteClick = (id: number) => {
    const flightIndex = flights.findIndex(f => f.id === id);
    if (flightIndex !== -1) {
      const updatedFlights = [...flights];
      updatedFlights[flightIndex] = {
        ...updatedFlights[flightIndex],
        status: 'deleted',
        deleted: true
      };
      
      setFlights(updatedFlights);
      setIsEditDialogOpen(false);
      setEditFlight(null);
    }
  };

  const handleTimeClick = (flightId: number, type: "start" | "end") => {
    const flight = flights.find((f) => f.id === flightId);
    if (flight) {
      setTimeEditFlightId(flightId);
      setTimeEditType(type);
      setIsTimePickerOpen(true);
    }
  };

  const getCurrentTimeValue = (): string | null => {
    if (timeEditFlightId !== null) {
      const flight = flights.find((f) => f.id === timeEditFlightId);
      if (flight) {
        return timeEditType === "start" ? flight.startTime : flight.endTime;
      }
    }
    return null;
  };

  const handleTimeSelected = (time: string) => {
    if (timeEditFlightId !== null) {
      const flightToUpdate = flights.find(f => f.id === timeEditFlightId);
      
      if (!flightToUpdate) {
        return;
      }
      
      const updatedFlight = { ...flightToUpdate };
      
      if (timeEditType === "start") {
        updatedFlight.startTime = time;
        if (updatedFlight.endTime) {
          updatedFlight.status = "completed";
        } else {
          updatedFlight.status = "in_flight";
        }
      } else {
        updatedFlight.endTime = time;
        updatedFlight.status = "completed";
        if (!updatedFlight.landingField) {
          updatedFlight.landingField = updatedFlight.startField;
        }
      }
      
      setFlights(
        flights.map((flight) => {
          if (flight.id === timeEditFlightId) {
            return updatedFlight;
          }
          return flight;
        })
      );
      
      if (isEditDialogOpen && editFlight && editFlight.id === timeEditFlightId) {
        setEditFlight(updatedFlight);
      }
      
      saveFlightToServer(updatedFlight);
      
      setIsTimePickerOpen(false);
      setTimeEditFlightId(null);
    }
  };

  // Function to save flight changes to the server
  const saveFlightToServer = async (flight: Flight) => {
    if (!flight.originalId) {
      return false;
    }
    
    try {
      // Format the date in YYYY-MM-DD format without timezone issues
      const year = selectedDate.getFullYear();
      const month = String(selectedDate.getMonth() + 1).padStart(2, '0');
      const day = String(selectedDate.getDate()).padStart(2, '0');
      const formattedDate = `${year}-${month}-${day}`;

      const payload = {
        date: formattedDate, // Include the historical date
        id: flight.id,
        originalId: flight.originalId,
        pilot: flight.pilot ? {
          id: flight.pilot.id,
          name: flight.pilot.name
        } : null,
        coPilot: flight.coPilot ? {
          id: flight.coPilot.id,
          name: flight.coPilot.name
        } : null,
        startTime: flight.startTime,
        endTime: flight.endTime,
        status: flight.status,
        isSchoolFlight: flight.isSchoolFlight,
        startField: flight.startField,
        landingField: flight.landingField,
        launchMethod: flight.launchMethod,
        distance: flight.distance || 0
      };
      
      const response = await fetch('/api/tablet/historical_edit_flight', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!data.success) {
        toast({
          title: "Fejl ved opdatering",
          description: data.error || "Der opstod en fejl ved opdatering af flyvningen",
          variant: "destructive",
        });
        return false;
      }
      
      toast({
        title: "Flyvning opdateret",
        description: `Historisk flyvning opdateret for ${format(selectedDate, 'dd. MMMM yyyy', { locale: da })}`,
        variant: "default",
      });
      
      return true;
    } catch (error) {
      toast({
        title: "Fejl ved opdatering",
        description: "Der opstod en uventet fejl",
        variant: "destructive",
      });
      return false;
    }
  };

  // Calculate flight duration
  const getFlightDuration = (startTime: string | null, endTime: string | null): string => {
    if (!startTime) return "-";

    const [startHour, startMin] = startTime.split(":").map(Number);

    if (!endTime) {
      // For historical data, we can't calculate "current" duration, so return "-"
      return "-";
    }

    if (startTime && endTime) {
      const [endHour, endMin] = endTime.split(":").map(Number);

      let durationMinutes = endHour * 60 + endMin - (startHour * 60 + startMin);
      if (durationMinutes < 0) durationMinutes += 24 * 60; // Handle overnight flights

      const hours = Math.floor(durationMinutes / 60);
      const minutes = durationMinutes % 60;

      return hours > 0 ? `${hours}t ${minutes}m` : `${minutes}m`;
    }

    return "-";
  };

  // Get active and deleted flights with stable sequential numbering
  const { activeFlights, deletedFlights } = useMemo(() => {
    // Filter active flights
    const active = flights.filter((flight) => {
      if (flight.status === "deleted" || flight.deleted) return false;
      return true;
    });
    
    // Use the display order function which handles both sorting and numbering
    const numberedAndSorted = createDisplayOrder(active);
    
    // Filter deleted flights
    const deleted = flights.filter((flight) => 
      flight.status === "deleted" || flight.deleted
    );
    
    return {
      activeFlights: numberedAndSorted,
      deletedFlights: deleted
    };
  }, [flights]);

  // Function to handle quick actions
  const handleStartFlight = async (id: number) => {
    const flightToUpdate = flights.find(f => f.id === id);
    if (flightToUpdate && flightToUpdate.originalId) {
      try {
        const response = await fetch('/api/tablet/quick_button', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            flightId: flightToUpdate.originalId,
            action: 'start'
          }),
        });

        const data = await response.json();
        
        if (data.success) {
          toast({
            title: "Start registreret",
            description: `Historisk flyvning startet for ${format(selectedDate, 'dd. MMMM yyyy', { locale: da })}`,
            variant: "default",
          });
          // Refresh the flights to get updated data
          fetchFlightsForDate(selectedDate);
        } else {
          toast({
            title: "Fejl ved start af flyvning",
            description: data.error || "Der opstod en fejl ved start af flyvningen",
            variant: "destructive",
          });
        }
      } catch (error) {
        toast({
          title: "Fejl ved start af flyvning",
          description: "Der opstod en uventet fejl",
          variant: "destructive",
        });
      }
    }
  };

  const handleEndFlight = async (id: number) => {
    const flightToUpdate = flights.find(f => f.id === id);
    if (flightToUpdate && flightToUpdate.originalId) {
      try {
        const response = await fetch('/api/tablet/quick_button', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            flightId: flightToUpdate.originalId,
            action: 'end'
          }),
        });

        const data = await response.json();
        
        if (data.success) {
          toast({
            title: "Landing registreret",
            description: `Historisk flyvning landet for ${format(selectedDate, 'dd. MMMM yyyy', { locale: da })}`,
            variant: "default",
          });
          // Refresh the flights to get updated data
          fetchFlightsForDate(selectedDate);
        } else {
          toast({
            title: "Fejl ved landing af flyvning",
            description: data.error || "Der opstod en fejl ved landing af flyvningen",
            variant: "destructive",
          });
        }
      } catch (error) {
        toast({
          title: "Fejl ved landing af flyvning",
          description: "Der opstod en uventet fejl",
          variant: "destructive",
        });
      }
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Historiske Flyvninger</CardTitle>
          <CardDescription>Indlæser...</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-32">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <TooltipProvider>
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Historiske Flyvninger</CardTitle>
          <CardDescription>Se og rediger flyvninger fra tidligere dage</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
        {/* Date selector - matching Reports implementation */}
        <div className="bg-muted/40 p-4 rounded-lg shadow-sm">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="text-base font-medium">
              Vælg dato
            </div>
            <div className="flex items-center gap-2">
              <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant={"outline"}
                    size={"lg"}
                    className={cn(
                      "min-w-[200px] justify-start text-left font-medium py-6 text-base",
                      !selectedDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-3 h-5 w-5" />
                    {selectedDate ? (
                      format(selectedDate, "dd. MMMM yyyy", { locale: da })
                    ) : (
                      <span>Vælg dato</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={selectedDate}
                    onSelect={(date) => {
                      setSelectedDate(date || new Date());
                      setCalendarOpen(false); // Close the calendar after selection
                    }}
                    initialFocus
                    locale={da}
                    className="rounded-md border shadow-md"
                    disabled={(date) => date > new Date()} // Disable future dates
                    modifiers={{
                      hasFlights: datesWithFlights
                    }}
                    modifiersClassNames={{
                      hasFlights: "font-semibold relative after:content-[''] after:absolute after:bottom-1 after:left-1/2 after:-translate-x-1/2 after:h-1 after:w-1 after:rounded-full after:bg-primary"
                    }}
                  />
                </PopoverContent>
              </Popover>
              <Button 
                onClick={() => setIsAddDialogOpen(true)}
                disabled={!selectedDate}
                className="py-6"
              >
                <Plus className="h-5 w-5 mr-2" />
                Tilføj flyvning
              </Button>
            </div>
          </div>
        </div>

        {/* Error message */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-md p-4">
            <p className="text-red-600">{error}</p>
          </div>
        )}

        {/* Loading state */}
        {isLoadingFlights && (
          <div className="flex items-center justify-center h-32">
            <div className="text-center">
              <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2" />
              <p className="text-muted-foreground">Indlæser flyvninger for {format(selectedDate, 'dd. MMMM yyyy', { locale: da })}...</p>
            </div>
          </div>
        )}

        {/* Flight list */}
        {!isLoadingFlights && selectedDate && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-medium">
                Flyvninger for {format(selectedDate, 'EEEE d. MMMM yyyy', { locale: da })}
              </h3>
              <span className="text-sm text-muted-foreground">
                {activeFlights.length} aktive flyvninger
                {deletedFlights.length > 0 && `, ${deletedFlights.length} slettede`}
              </span>
            </div>

            {activeFlights.length > 0 ? (
              <div className="space-y-1.5">
                {activeFlights.map((flight) => {
                  const flarmStatus = flight.aircraft.hasFlarm && flight.aircraft.flarmId 
                    ? flarmStatuses[flight.aircraft.flarmId] || 'unknown'
                    : null;
                  
                  return (
                    <HistoricalFlightCard
                      key={flight.id}
                      flight={flight}
                      sequentialNumber={flight.sequentialNumber}
                      onEditClick={handleEditClick}
                      onTimeClick={handleTimeClick}
                      getFlightDuration={getFlightDuration}
                      isRecentlyUpdated={false}
                      missingPilotWarning={false}
                      tableMode={true}
                      compact={false}
                      flarmStatus={flarmStatus}
                    />
                  );
                })}
              </div>
            ) : !error && (
              <EmptyFlightList />
            )}

            {/* Deleted flights */}
            {deletedFlights.length > 0 && (
              <div className="mt-8 pt-6 border-t">
                <h4 className="text-md font-medium mb-3 text-muted-foreground">Slettede flyvninger</h4>
                <div className="space-y-1.5 opacity-60">
                  {deletedFlights.map((flight) => (
                    <HistoricalFlightCard
                      key={flight.id}
                      flight={flight}
                      sequentialNumber={0}
                      onEditClick={handleEditClick}
                      onTimeClick={() => {}}
                      getFlightDuration={getFlightDuration}
                      isRecentlyUpdated={false}
                      missingPilotWarning={false}
                      tableMode={true}
                      compact={false}
                      flarmStatus={null}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Historical Add Flight Dialog */}
        <HistoricalAddFlightDialog
          open={isAddDialogOpen}
          onOpenChange={setIsAddDialogOpen}
          selectedDate={selectedDate}
          airfieldOptions={airfieldOptions}
          onFlightAdded={() => fetchFlightsForDate(selectedDate)}
        />

        {/* Edit Flight Dialog */}
        <EditFlightDialog
          open={isEditDialogOpen}
          onOpenChange={setIsEditDialogOpen}
          flight={editFlight}
          onSave={handleSaveEdit}
          onDelete={handleDeleteClick}
          onTimeClick={handleTimeClick}
          pilotOptions={[]} // Pass empty array, the real data will come from API
          airfieldOptions={airfieldOptions}
          flarmStatus={editFlight?.aircraft?.hasFlarm && editFlight?.aircraft?.flarmId 
            ? flarmStatuses[editFlight.aircraft.flarmId] || 'unknown'
            : null}
          isHistorical={true}
          historicalDate={selectedDate}
        />

        {/* Time Picker Dialog */}
        <TimePickerDialog
          open={isTimePickerOpen}
          onOpenChange={setIsTimePickerOpen}
          onTimeSelected={handleTimeSelected}
          type={timeEditType}
          currentValue={getCurrentTimeValue()}
        />
        </CardContent>
      </Card>
    </TooltipProvider>
  );
}