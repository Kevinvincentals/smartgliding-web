import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { GraduationCap, Users } from "lucide-react"
import type { Flight } from "@/types/flight"

interface DeletedFlightsListProps {
  flights: Flight[]
}

export function DeletedFlightsList({ flights }: DeletedFlightsListProps) {
  if (flights.length === 0) return null

  return (
    <div className="mt-2">
      <div className="mb-1 text-base font-medium text-muted-foreground">Slettede Flyvninger</div>
      <div className="grid grid-cols-1 gap-2">
        {flights.map((flight) => (
          <Card key={flight.id} className="overflow-hidden bg-gray-100 border-gray-300 opacity-70">
            <div className="flex py-2">
              <div className="px-3 flex-1">
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-1">
                    <h3 className="text-lg font-bold text-gray-600">{flight.aircraft.registration}</h3>
                    {flight.isSchoolFlight && <GraduationCap className="h-5 w-5 text-gray-500" />}
                  </div>
                  <Badge className="text-sm px-2 py-0.5 bg-gray-200 text-gray-700" variant="secondary">
                    Slettet
                  </Badge>
                </div>

                <div className="flex items-center gap-1 mt-1">
                  <Users className="h-4 w-4 text-gray-500" />
                  {flight.pilot ? (
                    <>
                      <span className="text-sm text-gray-600">{flight.pilot.name}</span>
                      {flight.coPilot && <span className="text-sm text-gray-500"> & {flight.coPilot.name}</span>}
                    </>
                  ) : (
                    <span className="text-sm text-gray-500">Ingen pilot valgt</span>
                  )}
                </div>

                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0 text-sm text-gray-600">
                  <div>
                    <span className="text-gray-500">Start: </span>
                    <span>{flight.startTime || "-"}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Slut: </span>
                    <span>{flight.endTime || "-"}</span>
                  </div>
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}

