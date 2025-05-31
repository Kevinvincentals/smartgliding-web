"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerFooter } from "@/components/ui/drawer"
import { Button } from "@/components/ui/button"
import { Clock } from "lucide-react"
import { useIsMobile } from "@/hooks/use-mobile"

type TimePickerDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onTimeSelected: (time: string) => void
  type: "start" | "end"
  currentValue?: string | null
}

export function TimePickerDialog({ 
  open, 
  onOpenChange, 
  onTimeSelected, 
  type, 
  currentValue 
}: TimePickerDialogProps) {
  const [hours, setHours] = useState<number>(new Date().getHours())
  const [minutes, setMinutes] = useState<number>(new Date().getMinutes())

  const isMobile = useIsMobile();

  // Update time when dialog opens or currentValue changes
  useEffect(() => {
    if (open) {
      if (currentValue) {
        // Parse the current time value if available
        const [h, m] = currentValue.split(':').map(Number)
        if (!isNaN(h) && !isNaN(m)) {
          setHours(h)
          setMinutes(m)
          return // Exit early since we've set the time
        }
      }
      
      // Fall back to current time if no valid currentValue is provided
      const now = new Date()
      setHours(now.getHours())
      setMinutes(now.getMinutes())
    }
  }, [open, currentValue])

  const handleSave = () => {
    // Format time string - this is local time that will be passed to the server
    // The server will handle conversion to UTC correctly with our updated utility functions
    const timeString = `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`
    
    // Log the selected time for debugging
    console.log(`Time picker: Selected local time ${timeString} for ${type} time (as shown to the user)`)
    console.log(`Current browser timezone offset: ${new Date().getTimezoneOffset() / -60} hours from UTC`)
    
    onTimeSelected(timeString)
    onOpenChange(false) // Ensure dialog closes after selection
  }

  return (
    <>
      {isMobile ? (
        <Drawer open={open} onOpenChange={onOpenChange}>
          <DrawerContent className="max-h-[90vh]">
            <DrawerHeader>
              <DrawerTitle className="text-xl flex items-center gap-2 justify-center">
                <Clock className="h-5 w-5" />
                {type === "start" ? "Indstil Starttid" : "Indstil Sluttid"}
              </DrawerTitle>
            </DrawerHeader>

            <div className="py-6 px-4">
              <div className="flex justify-center items-center gap-4">
                <div className="flex flex-col items-center">
                  <div className="text-sm font-medium mb-2">Timer</div>
                  <div className="flex flex-col items-center gap-2">
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-12 w-12 rounded-full text-lg"
                      onClick={() => setHours((prev) => (prev + 1) % 24)}
                    >
                      ▲
                    </Button>
                    <div className="text-3xl font-bold w-20 h-20 flex items-center justify-center border rounded-lg">
                      {hours.toString().padStart(2, "0")}
                    </div>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-12 w-12 rounded-full text-lg"
                      onClick={() => setHours((prev) => (prev - 1 + 24) % 24)}
                    >
                      ▼
                    </Button>
                  </div>
                </div>

                <div className="text-3xl font-bold">:</div>

                <div className="flex flex-col items-center">
                  <div className="text-sm font-medium mb-2">Minutter</div>
                  <div className="flex flex-col items-center gap-2">
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-12 w-12 rounded-full text-lg"
                      onClick={() => setMinutes((prev) => (prev + 1) % 60)}
                    >
                      ▲
                    </Button>
                    <div className="text-3xl font-bold w-20 h-20 flex items-center justify-center border rounded-lg">
                      {minutes.toString().padStart(2, "0")}
                    </div>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-12 w-12 rounded-full text-lg"
                      onClick={() => setMinutes((prev) => (prev - 1 + 60) % 60)}
                    >
                      ▼
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            <DrawerFooter>
              <div className="grid grid-cols-2 gap-2">
                <Button 
                  variant="outline" 
                  className="h-14 text-base" 
                  onClick={() => onOpenChange(false)}
                >
                  Annuller
                </Button>
                <Button 
                  className="h-14 text-base" 
                  onClick={handleSave}
                >
                  Indstil Tid
                </Button>
              </div>
            </DrawerFooter>
          </DrawerContent>
        </Drawer>
      ) : (
        <Dialog open={open} onOpenChange={onOpenChange}>
          <DialogContent className="sm:max-w-[400px]">
            <DialogHeader>
              <DialogTitle className="text-xl flex items-center gap-2">
                <Clock className="h-5 w-5" />
                {type === "start" ? "Indstil Starttid" : "Indstil Sluttid"}
              </DialogTitle>
            </DialogHeader>

            <div className="py-6">
              <div className="flex justify-center items-center gap-4">
                <div className="flex flex-col items-center">
                  <div className="text-sm font-medium mb-2">Timer</div>
                  <div className="flex flex-col items-center gap-2">
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-12 w-12 rounded-full text-lg"
                      onClick={() => setHours((prev) => (prev + 1) % 24)}
                    >
                      ▲
                    </Button>
                    <div className="text-3xl font-bold w-20 h-20 flex items-center justify-center border rounded-lg">
                      {hours.toString().padStart(2, "0")}
                    </div>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-12 w-12 rounded-full text-lg"
                      onClick={() => setHours((prev) => (prev - 1 + 24) % 24)}
                    >
                      ▼
                    </Button>
                  </div>
                </div>

                <div className="text-3xl font-bold">:</div>

                <div className="flex flex-col items-center">
                  <div className="text-sm font-medium mb-2">Minutter</div>
                  <div className="flex flex-col items-center gap-2">
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-12 w-12 rounded-full text-lg"
                      onClick={() => setMinutes((prev) => (prev + 1) % 60)}
                    >
                      ▲
                    </Button>
                    <div className="text-3xl font-bold w-20 h-20 flex items-center justify-center border rounded-lg">
                      {minutes.toString().padStart(2, "0")}
                    </div>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-12 w-12 rounded-full text-lg"
                      onClick={() => setMinutes((prev) => (prev - 1 + 60) % 60)}
                    >
                      ▼
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            <DialogFooter>
              <div className="flex w-full justify-between gap-4">
                <Button 
                  variant="outline" 
                  size="lg" 
                  className="h-14 px-5 text-lg font-medium flex-1" 
                  onClick={() => onOpenChange(false)}
                >
                  Annuller
                </Button>
                <Button 
                  size="lg" 
                  className="h-14 px-5 text-lg font-medium flex-1" 
                  onClick={handleSave}
                >
                  Indstil Tid
                </Button>
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  )
}

