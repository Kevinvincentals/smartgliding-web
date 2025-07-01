"use client"

import { useState } from "react"
import { Users, Save } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useToast } from "@/components/ui/use-toast"
import { Badge } from "@/components/ui/badge"

interface BatchMembershipDialogProps {
  isOpen: boolean
  onClose: () => void
  selectedPilotIds: string[]
  pilots: any[]
  onUpdate: (updatedPilots: any[]) => void
}

export function BatchMembershipDialog({ 
  isOpen, 
  onClose, 
  selectedPilotIds, 
  pilots, 
  onUpdate 
}: BatchMembershipDialogProps) {
  const { toast } = useToast()
  const [isLoading, setIsLoading] = useState(false)
  const [newMembership, setNewMembership] = useState<'A' | 'B' | 'C'>('A')

  const selectedPilots = pilots.filter(p => selectedPilotIds.includes(p.pilot.id))

  const handleSubmit = async () => {
    if (selectedPilotIds.length === 0) {
      toast({
        title: "Ingen piloter valgt",
        description: "Vælg mindst én pilot for at ændre medlemskab",
        variant: "destructive",
      })
      return
    }

    setIsLoading(true)
    try {
      // Update each pilot's membership
      const updatePromises = selectedPilotIds.map(async (pilotId) => {
        const response = await fetch('/api/club/admin/update_pilot', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({
            pilotId: pilotId,
            membership: newMembership
          }),
        })

        if (!response.ok) {
          const errorData = await response.json()
          throw new Error(`Failed to update pilot ${pilotId}: ${errorData.error}`)
        }

        return response.json()
      })

      await Promise.all(updatePromises)

      toast({
        title: "Medlemskab opdateret",
        description: `${selectedPilotIds.length} pilot(er) er nu sat til medlemskab ${newMembership}`,
        variant: "default",
      })

      // Update the pilots in the parent component
      const updatedPilots = pilots.map(p => {
        if (selectedPilotIds.includes(p.pilot.id)) {
          return {
            ...p,
            pilot: {
              ...p.pilot,
              membership: newMembership
            }
          }
        }
        return p
      })

      onUpdate(updatedPilots)
      onClose()
    } catch (error: any) {
      console.error('Error updating pilot memberships:', error)
      toast({
        title: "Fejl",
        description: error.message || "Kunne ikke opdatere medlemskaber",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center">
            <Users className="h-5 w-5 mr-2" />
            Batch Medlemskab Ændring
          </DialogTitle>
          <DialogDescription>
            Ændrer medlemskab for {selectedPilotIds.length} valgte pilot(er).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Valgte piloter ({selectedPilots.length})</Label>
            <div className="max-h-32 overflow-y-auto border rounded-md p-2 space-y-1">
              {selectedPilots.map((pilot) => (
                <div key={pilot.pilot.id} className="flex items-center justify-between text-sm">
                  <span>{pilot.pilot.firstname} {pilot.pilot.lastname}</span>
                  <Badge variant="outline" className="text-xs">
                    Nuværende: {pilot.pilot.membership}
                  </Badge>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="membership">Nyt medlemskab</Label>
            <Select value={newMembership} onValueChange={(value: 'A' | 'B' | 'C') => setNewMembership(value)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="A">A</SelectItem>
                <SelectItem value="B">B</SelectItem>
                <SelectItem value="C">C</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="bg-blue-50 p-3 rounded-md">
            <p className="text-sm text-blue-800">
              <strong>Ændring:</strong> {selectedPilotIds.length} pilot(er) vil få medlemskab ændret til <strong>{newMembership}</strong>
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={isLoading}>
            Annuller
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={isLoading}>
            <Save className="h-4 w-4 mr-2" />
            {isLoading ? "Opdaterer..." : `Opdater ${selectedPilotIds.length} pilot(er)`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}