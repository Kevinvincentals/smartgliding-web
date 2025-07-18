"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Combobox } from "@/components/ui/combobox"
import { MapPin, Loader2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { useToast } from "@/components/ui/use-toast"
import type { AirfieldOption } from "@/types/flight"

interface ChangeAirfieldDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentAirfield: string | null
}

export function ChangeAirfieldDialog({
  open,
  onOpenChange,
  currentAirfield
}: ChangeAirfieldDialogProps) {
  const [selectedAirfield, setSelectedAirfield] = useState<string>("")
  const [isChanging, setIsChanging] = useState(false)
  const [airfieldOptions, setAirfieldOptions] = useState<AirfieldOption[]>([])
  const [isLoadingAirfields, setIsLoadingAirfields] = useState(false)
  const router = useRouter()
  const { toast } = useToast()

  // Fetch airfields when dialog opens
  useEffect(() => {
    if (open) {
      // Set current airfield as selected
      if (currentAirfield) {
        setSelectedAirfield(currentAirfield)
      }
      
      // Fetch airfields from API
      const fetchAirfields = async () => {
        setIsLoadingAirfields(true)
        try {
          const response = await fetch('/api/tablet/fetch_airfields')
          const data = await response.json()
          
          if (data.success && data.airfields) {
            const mappedAirfields: AirfieldOption[] = data.airfields.map((af: any) => ({
              id: af.code,
              name: `${af.code} - ${af.name}`,
              type: af.type
            }))
            setAirfieldOptions(mappedAirfields)
          }
        } catch (error) {
          console.error('Error fetching airfields:', error)
          toast({
            title: "Fejl ved hentning af flyvepladser",
            description: "Kunne ikke hente liste over flyvepladser",
            variant: "destructive",
          })
        } finally {
          setIsLoadingAirfields(false)
        }
      }
      
      fetchAirfields()
    }
  }, [open, currentAirfield, toast])

  const handleChangeAirfield = async () => {
    if (!selectedAirfield || selectedAirfield === currentAirfield) {
      onOpenChange(false)
      return
    }

    setIsChanging(true)
    
    try {
      // Call API to update the selected airfield
      const response = await fetch('/api/tablet/change_airfield', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          selectedAirfield
        }),
      })

      const data = await response.json()

      if (!data.success) {
        toast({
          title: "Fejl ved skift af flyveplads",
          description: data.error || "Der opstod en fejl ved skift af flyveplads",
          variant: "destructive",
        })
        return
      }

      // Update localStorage
      localStorage.setItem('selectedAirfield', selectedAirfield)
      
      toast({
        title: "Flyveplads ændret",
        description: `Du er nu skiftet til ${selectedAirfield}`,
      })

      // Close dialog and refresh the page
      onOpenChange(false)
      router.refresh()
      window.location.reload() // Force full reload to ensure WebSocket reconnects
      
    } catch (error) {
      console.error('Error changing airfield:', error)
      toast({
        title: "Fejl ved skift af flyveplads",
        description: "Der opstod en uventet fejl",
        variant: "destructive",
      })
    } finally {
      setIsChanging(false)
    }
  }

  const selectedAirfieldData = airfieldOptions.find(a => a.id === selectedAirfield)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            Skift flyveplads
          </DialogTitle>
          <DialogDescription>
            Vælg hvilken flyveplads du vil operere fra. Dette vil opdatere din startliste til kun at vise flyvninger for den valgte plads.
          </DialogDescription>
        </DialogHeader>
        
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="airfield">Flyveplads</Label>
            {isLoadingAirfields ? (
              <div className="flex items-center justify-center h-12 border border-input rounded-md bg-background">
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                <span className="text-sm text-muted-foreground">Henter flyvepladser...</span>
              </div>
            ) : (
              <Combobox
                items={airfieldOptions.map(airfield => ({
                  value: airfield.id,
                  label: airfield.name
                }))}
                value={selectedAirfield}
                onChange={setSelectedAirfield}
                placeholder="Vælg flyveplads"
                emptyText="Ingen flyvepladser fundet"
                initialSearchMode={true}
                tallDropdown={true}
              />
            )}
          </div>

          {selectedAirfieldData && selectedAirfield !== currentAirfield && (
            <div className="rounded-lg border bg-muted p-3">
              <p className="text-sm text-muted-foreground">
                Du skifter fra <span className="font-medium">{currentAirfield}</span> til{" "}
                <span className="font-medium">{selectedAirfieldData.name}</span>
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isChanging}
          >
            Annuller
          </Button>
          <Button
            onClick={handleChangeAirfield}
            disabled={isChanging || !selectedAirfield || selectedAirfield === currentAirfield}
          >
            {isChanging ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Skifter...
              </>
            ) : (
              'Skift flyveplads'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}