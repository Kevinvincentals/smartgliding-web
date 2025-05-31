import { Plane } from "lucide-react"

export function EmptyFlightList() {
  return (
    <div className="flex flex-col items-center justify-center py-8 sm:py-12 mt-16 sm:mt-0 bg-slate-50 rounded-lg mx-1 sm:mx-0">
      <Plane className="h-10 w-10 sm:h-12 sm:w-12 text-muted-foreground/40 mb-2 sm:mb-3" />
      <p className="text-base sm:text-lg font-medium text-center">Ingen flyvninger i dag</p>
      <p className="text-xs sm:text-sm text-muted-foreground mt-1 px-4 text-center">
        Klik på "Tilføj flyvning" for at registrere en ny flyvning
      </p>
    </div>
  )
}

// We no longer need this component since we're using the loader from statistics component directly
export function FlightLoadingAnimation() {
  return (
    <div className="flex flex-col items-center justify-center py-8 sm:py-12">
      <Plane className="h-8 w-8 sm:h-10 sm:w-10 text-muted-foreground/50 mb-2 sm:mb-3" />
      <p className="text-sm sm:text-base font-medium text-muted-foreground">Indlæser flyvninger...</p>
    </div>
  )
}

