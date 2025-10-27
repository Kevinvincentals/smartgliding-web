"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { FileDown, FileText, Loader2, User, Users, Calendar as CalendarIcon } from "lucide-react"
import { useToast } from "@/components/ui/use-toast"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { format } from "date-fns"
import { da } from "date-fns/locale"

interface ReportsProps {
  isLoading?: boolean;
  trafficLeader?: string;
  towPerson?: string;
}

export function Reports({ isLoading = false, trafficLeader, towPerson }: ReportsProps) {
  const { toast } = useToast()
  const [isGeneratingFlightList, setIsGeneratingFlightList] = useState(false)
  const [selectedDate, setSelectedDate] = useState<Date>(new Date())
  const [calendarOpen, setCalendarOpen] = useState(false)
  const [datesWithFlights, setDatesWithFlights] = useState<Date[]>([])

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

  // Generate flight list PDF
  const handleGenerateFlightListPDF = async () => {
    setIsGeneratingFlightList(true)
    
    try {
      // Fix timezone issues by setting the date to noon (to avoid timezone shifts)
      const dateToUse = new Date(selectedDate);
      dateToUse.setHours(12, 0, 0, 0);
      
      // Format the date in YYYY-MM-DD format without timezone issues
      const year = dateToUse.getFullYear();
      const month = String(dateToUse.getMonth() + 1).padStart(2, '0');
      const day = String(dateToUse.getDate()).padStart(2, '0');
      const formattedDate = `${year}-${month}-${day}`;
      
      window.open(`/api/reports/flight-list-pdf?date=${formattedDate}`, '_blank')
      
      toast({
        title: "PDF genereret",
        description: `Startliste for ${format(dateToUse, 'dd. MMMM yyyy', { locale: da })} er blevet eksporteret som PDF`,
        variant: "default",
      })
    } catch (error) {
      console.error('Error generating flight list PDF:', error)
      toast({
        title: "Fejl ved generering af PDF",
        description: "Der opstod en fejl. Prøv igen senere.",
        variant: "destructive",
      })
    } finally {
      setIsGeneratingFlightList(false)
    }
  }
  
  // Helper function to render daily info status
  const renderDailyInfoStatus = () => {
    if (!trafficLeader && !towPerson) {
      return (
        <p className="text-sm text-yellow-600 mt-2 flex items-center">
          <Users className="h-4 w-4 mr-1" />
          <span>Trafikleder og spilfører er ikke angivet for i dag</span>
        </p>
      );
    }
    
    if (!trafficLeader) {
      return (
        <p className="text-sm text-yellow-600 mt-2 flex items-center">
          <User className="h-4 w-4 mr-1" />
          <span>Trafikleder er ikke angivet for i dag</span>
        </p>
      );
    }
    
    if (!towPerson) {
      return (
        <p className="text-sm text-yellow-600 mt-2 flex items-center">
          <User className="h-4 w-4 mr-1" />
          <span>Spilfører er ikke angivet for i dag</span>
        </p>
      );
    }
    
    // Both traffic leader and tow person are set, return nothing
    return null;
  };
  
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Rapporter</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Global Date Picker */}
        <div className="bg-muted/40 p-4 rounded-lg shadow-sm">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="text-base font-medium">
              Vælg dato
            </div>
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
                  modifiers={{
                    hasFlights: datesWithFlights
                  }}
                  modifiersClassNames={{
                    hasFlights: "font-semibold relative after:content-[''] after:absolute after:bottom-1 after:left-1/2 after:-translate-x-1/2 after:h-1 after:w-1 after:rounded-full after:bg-primary"
                  }}
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Flight List PDF */}
          <Card className="border-dashed">
            <CardContent className="p-4 flex flex-col items-center text-center">
              <FileText className="h-16 w-16 text-blue-600 mb-4 mt-2" />
              <CardTitle className="text-lg mb-2">Startliste</CardTitle>
              <CardDescription className="mb-4">
                Eksporter startliste som PDF
              </CardDescription>
              
              {renderDailyInfoStatus()}
              <Button 
                onClick={handleGenerateFlightListPDF} 
                className="w-full mt-2 py-5 text-base"
                disabled={isGeneratingFlightList || isLoading}
              >
                {isGeneratingFlightList ? (
                  <>
                    <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                    Genererer...
                  </>
                ) : (
                  <>
                    <FileDown className="h-5 w-5 mr-2" />
                    Download PDF
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
          
          {/* Statistics PDF - Coming soon */}
          <Card className="border-dashed bg-muted/30">
            <CardContent className="p-4 flex flex-col items-center text-center">
              <FileText className="h-16 w-16 text-muted-foreground/60 mb-4 mt-2" />
              <CardTitle className="text-lg mb-2 text-muted-foreground">Statistikker</CardTitle>
              <CardDescription className="mb-4">
                Eksporter statistik som PDF (Kommer snart)
              </CardDescription>
              <Button 
                disabled={true}
                className="w-full mt-2 py-5 text-base"
                variant="outline"
              >
                <FileDown className="h-5 w-5 mr-2" />
                Kommer snart
              </Button>
            </CardContent>
          </Card>
          
          {/* Aircraft Report PDF - Coming soon */}
          <Card className="border-dashed bg-muted/30">
            <CardContent className="p-4 flex flex-col items-center text-center">
              <FileText className="h-16 w-16 text-muted-foreground/60 mb-4 mt-2" />
              <CardTitle className="text-lg mb-2 text-muted-foreground">Fly Rapport</CardTitle>
              <CardDescription className="mb-4">
                Eksporter fly-rapport som PDF (Kommer snart)
              </CardDescription>
              <Button 
                disabled={true}
                className="w-full mt-2 py-5 text-base"
                variant="outline"
              >
                <FileDown className="h-5 w-5 mr-2" />
                Kommer snart
              </Button>
            </CardContent>
          </Card>
        </div>
      </CardContent>
    </Card>
  )
} 