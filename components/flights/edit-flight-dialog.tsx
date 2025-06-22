"use client"
import { useState, useEffect, useRef } from "react"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Drawer, DrawerContent, DrawerFooter, DrawerHeader, DrawerTitle, DrawerDescription, DrawerClose } from "@/components/ui/drawer"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Combobox } from "@/components/ui/combobox"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip"
import { Clock, PlaneTakeoff, Trash, Save, Loader2, AlertCircle, FileText, RotateCcw } from "lucide-react"
import Image from "next/image"
import type { Flight, Pilot, AirfieldOption, LaunchMethod } from "@/types/flight"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { localTimeStringToUTC } from "@/lib/time-utils"
import { toast as hotToast } from 'react-hot-toast'
import { useIsMobile } from "@/hooks/use-mobile"
import { NoteDialog } from "./note-dialog"

type FlarmStatus = 'online' | 'offline' | 'unknown';

interface EditFlightDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  flight: Flight | null
  onSave: (flight: Flight) => void
  onDelete: (id: number) => void
  onTimeClick: (id: number, type: "start" | "end") => void
  pilotOptions: Pilot[]
  airfieldOptions: AirfieldOption[]
  flarmStatus: FlarmStatus | null
  isHistorical?: boolean
  historicalDate?: Date
}

export function EditFlightDialog({
  open,
  onOpenChange,
  flight,
  onSave,
  onDelete,
  onTimeClick,
  pilotOptions,
  airfieldOptions: initialAirfieldOptions,
  flarmStatus,
  isHistorical = false,
  historicalDate,
}: EditFlightDialogProps) {
  const [apiPilots, setApiPilots] = useState<Pilot[]>([])
  const [isLoadingPilots, setIsLoadingPilots] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [airfieldOptions, setAirfieldOptions] = useState(initialAirfieldOptions)
  
  // State to track selected pilots and fields
  const [selectedPilot, setSelectedPilot] = useState<Pilot | null>(null)
  const [selectedCoPilot, setSelectedCoPilot] = useState<Pilot | null>(null)
  const [selectedStartField, setSelectedStartField] = useState<string>("")
  const [selectedLandingField, setSelectedLandingField] = useState<string | null>(null)
  const [isSchoolFlightChecked, setIsSchoolFlightChecked] = useState<boolean>(false)
  const [selectedLaunchMethod, setSelectedLaunchMethod] = useState<LaunchMethod>("S")
  
  // Add refs for the combobox inputs
  const pilotInputRef = useRef<HTMLDivElement>(null);
  const coPilotInputRef = useRef<HTMLDivElement>(null);

  // Add state for tracking time inputs
  const [startTimeInput, setStartTimeInput] = useState<string>("");
  const [endTimeInput, setEndTimeInput] = useState<string>("");

  // Add state for note dialog
  const [showNoteDialog, setShowNoteDialog] = useState(false);
  const [currentNotes, setCurrentNotes] = useState<string>("");

  // Add state for private plane functionality
  const [isPrivatePlane, setIsPrivatePlane] = useState<boolean>(false);
  const [isLoadingPrivateStatus, setIsLoadingPrivateStatus] = useState<boolean>(false);

  const isMobile = useIsMobile();

  // Combine API pilots with existing pilot options
  const allPilotOptions = [...apiPilots, ...pilotOptions.filter(
    p => !apiPilots.some(ap => ap.id === p.id)
  )]

  // Fetch pilots and club fields when dialog opens
  useEffect(() => {
    if (open) {
      fetchPilots()
      fetchClubFields()
      checkPrivatePlaneStatus()
      // Reset state when dialog opens
      setError(null)
    }
  }, [open])

  const fetchPilots = async () => {
    setIsLoadingPilots(true)
    setError(null)
    
    try {
      const response = await fetch('/api/tablet/fetch_pilots')
      
      if (!response.ok) {
        throw new Error('Failed to fetch pilots')
      }
      
      const data = await response.json()
      
      if (data.success && data.pilots) {
        // Transform the API response to match the Pilot interface
        const pilots = data.pilots.map((pilot: any) => ({
          id: pilot.id, // Keep the original MongoDB ID
          name: pilot.name
        }))
        
        setApiPilots(pilots)
      } else {
        setError('Failed to load pilots data')
      }
    } catch (err) {
      console.error('Error fetching pilots:', err)
      setError('Failed to fetch pilots')
    } finally {
      setIsLoadingPilots(false)
    }
  }

  const fetchClubFields = async () => {
    try {
      const response = await fetch('/api/tablet/fetch_club_fields')
      
      if (!response.ok) {
        throw new Error('Failed to fetch club fields')
      }
      
      const data = await response.json()
      
      if (data.success && data.airfieldOptions) {
        setAirfieldOptions(data.airfieldOptions)
      } else {
        setError('Failed to load club fields')
      }
    } catch (err) {
      console.error('Error fetching club fields:', err)
      setError('Failed to fetch club fields')
    }
  }

  const checkPrivatePlaneStatus = async () => {
    if (!flight?.planeId && !flight?.aircraft?.id) return;
    
    // First check if the flight already has the isPrivatePlane property
    if (flight.isPrivatePlane !== undefined) {
      setIsPrivatePlane(flight.isPrivatePlane);
      return;
    }
    
    setIsLoadingPrivateStatus(true);
    try {
      const response = await fetch('/api/tablet/private_planes');
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.privatePlanes) {
          // Use the planeId from the flight object if available
          const planeIdToCheck = flight.planeId;
          
          if (planeIdToCheck) {
            const isPrivate = data.privatePlanes.some((pp: any) => pp.planeId === planeIdToCheck);
            setIsPrivatePlane(isPrivate);
          } else {
            // Fallback to registration match if no planeId
            const registrationMatch = data.privatePlanes.some((pp: any) => 
              pp.plane?.registration_id === flight.aircraft.registration
            );
            setIsPrivatePlane(registrationMatch);
          }
        }
      }
    } catch (err) {
      console.error('Error checking private plane status:', err);
    } finally {
      setIsLoadingPrivateStatus(false);
    }
  };

  const removePrivatePlaneStatus = async () => {
    if (!flight?.planeId && !flight?.aircraft?.id) return;
    
    setIsLoadingPrivateStatus(true);
    try {
      // Use the planeId from the flight object if available, otherwise fall back to aircraft.id
      const planeIdToUse = flight.planeId || flight.aircraft.id;
      
      const response = await fetch(`/api/tablet/private_planes?planeId=${planeIdToUse}`, {
        method: 'DELETE'
      });
      
      if (response.ok) {
        setIsPrivatePlane(false);
        // Show success message
        hotToast.success("Fly er ikke længere markeret som privat for i dag", {
          position: 'top-center'
        });
      } else {
        setError('Kunne ikke fjerne privat fly status');
      }
    } catch (err) {
      console.error('Error removing private plane status:', err);
      setError('Fejl ved fjernelse af privat fly status');
    } finally {
      setIsLoadingPrivateStatus(false);
    }
  };

  // Update local state when flight changes
  useEffect(() => {
    if (flight) {
      // Only update the pilot state if it's explicitly present
      // Check if pilot is provided and not null
      if (flight.pilot) {
        setSelectedPilot(flight.pilot);
      } else {
        // If pilot is null, explicitly set to null
        // This ensures we properly clear the state
        setSelectedPilot(null);
      }
      
      // For co-pilot, if aircraft is single-seater, always set to null
      // Otherwise, use the provided co-pilot if available
      if (!flight.aircraft.isDoubleSeater) {
        setSelectedCoPilot(null);
      } else if (flight.coPilot) {
        setSelectedCoPilot(flight.coPilot);
      } else {
        setSelectedCoPilot(null);
      }
      
      // Set airfield values 
      setSelectedStartField(flight.startField);
      setSelectedLandingField(flight.landingField);
      
      // Set school flight status
      setIsSchoolFlightChecked(flight.isSchoolFlight || false);

      // Set launch method
      setSelectedLaunchMethod(flight.launchMethod || "S");
      
      // Initialize time input state when the flight changes
      setStartTimeInput(flight.startTime || "");
      setEndTimeInput(flight.endTime || "");
      
      // Initialize notes
      const flightNotes = flight.notes || "";
      setCurrentNotes(flightNotes);
      
      console.log('Dialog state updated with flight:', JSON.stringify({
        pilot: flight.pilot,
        coPilot: flight.coPilot,
        fields: { start: flight.startField, landing: flight.landingField },
        isSchool: flight.isSchoolFlight,
        launchMethod: flight.launchMethod,
        isDoubleSeater: flight.aircraft.isDoubleSeater,
        notes: flightNotes
      }, null, 2));
    }
  }, [flight])

  if (!flight) return null

  const handleDeleteClick = () => {
    setShowDeleteConfirm(true);
  };

  const handleDeleteConfirm = async () => {
    setIsDeleting(true);
    setError(null);
    
    try {
      const response = await fetch('/api/tablet/delete_flight', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          flightId: flight.id,
          originalId: flight.originalId
        }),
      });

      const data = await response.json();

      if (data.success) {
        // Display success notification
        hotToast.success("Flyvning slettet", {
          position: 'top-center'
        });
        
        // Close both dialogs
        setShowDeleteConfirm(false);
        onOpenChange(false);
        // Notify parent component to remove the flight from the UI
        onDelete(flight.id);
      } else {
        setError(`Failed to delete flight: ${data.error || 'Unknown error'}`);
        // Keep the dialogs open if there was an error
      }
    } catch (err) {
      console.error('Error deleting flight:', err);
      setError('Failed to delete the flight.');
      // Keep the dialogs open if there was an error
    } finally {
      setIsDeleting(false);
    }
  };
  
  const handlePilotChange = (value: string) => {
    // Special handling for "guest" value from Continue button
    if (value === "guest") {
      // If pilot input contains text, use it as a guest pilot
      if (pilotInputRef.current) {
        const input = pilotInputRef.current.querySelector('input');
        if (input && input.value.trim()) {
          // Create a guest pilot with entered text
          const guestPilot = { id: "guest", name: input.value.trim() };
          console.log('Setting guest pilot to:', guestPilot);
          setSelectedPilot(guestPilot);
        }
      }
      return;
    }
    
    // Check if this is a regular pilot selection (by ID)
    const foundPilot = allPilotOptions.find((p) => p.id.toString() === value);
    if (foundPilot) {
      console.log('Setting pilot to:', foundPilot);
      setSelectedPilot(foundPilot);
    } else {
      // If no pilot found by ID, treat as guest pilot name
      const guestPilot = { id: "guest", name: value };
      console.log('Setting guest pilot to:', guestPilot);
      setSelectedPilot(guestPilot);
    }
  };
  
  const handleCoPilotChange = (value: string) => {
    // Special handling for "guest" value from Continue button
    if (value === "guest") {
      // If co-pilot input contains text, use it as a guest co-pilot
      if (coPilotInputRef.current) {
        const input = coPilotInputRef.current.querySelector('input');
        if (input && input.value.trim()) {
          // Create a guest co-pilot with entered text
          const guestCoPilot = { id: "guest", name: input.value.trim() };
          console.log('Setting guest co-pilot to:', guestCoPilot);
          setSelectedCoPilot(guestCoPilot);
        }
      }
      return;
    }
    
    // Check if this is a regular pilot selection (by ID)
    const foundPilot = allPilotOptions.find((p) => p.id.toString() === value);
    if (foundPilot) {
      console.log('Setting co-pilot to:', foundPilot);
      setSelectedCoPilot(foundPilot);
    } else {
      // If no pilot found by ID, treat as guest pilot name
      const guestCoPilot = { id: "guest", name: value };
      console.log('Setting guest co-pilot to:', guestCoPilot);
      setSelectedCoPilot(guestCoPilot);
    }
  };
  
  const handleStartFieldChange = (value: string) => {
    console.log("Setting startField to:", value);
    setSelectedStartField(value);
    // Don't call onSave here to prevent immediate API calls
  };
  
  const handleLandingFieldChange = (value: string) => {
    const newValue = value === "none" ? null : value;
    console.log("Setting landingField to:", newValue);
    setSelectedLandingField(newValue);
    // Don't call onSave here to prevent immediate API calls
  };

  const handleLaunchMethodChange = (value: string) => {
    console.log("Setting launchMethod to:", value);
    setSelectedLaunchMethod(value as LaunchMethod);
    // Don't call onSave here to prevent immediate API calls
  };

  const handleSchoolFlightChange = (checked: boolean) => {
    console.log("Setting schoolFlight to:", checked);
    setIsSchoolFlightChecked(checked);
    // Don't call onSave here to prevent immediate API calls
  };

  // Modify the removePilotDirectly function to handle state updates and prevent double saves
  const removePilotDirectly = async (pilotType: 'pilot1' | 'pilot2') => {
    if (!flight) return;
    
    setIsSaving(true);
    setError(null);
    
    // Create a deep copy of the flight to avoid reference issues
    const updatedFlight = JSON.parse(JSON.stringify(flight));
    
    // Clear the appropriate UI state and update flight object
    if (pilotType === 'pilot1') {
      // Important: Set both the state and the flight object to null
      setSelectedPilot(null);
      updatedFlight.pilot = null;
      
      // Clear input field
      if (pilotInputRef.current) {
        const input = pilotInputRef.current.querySelector('input');
        if (input) input.value = '';
      }
    } else {
      // Important: Set both the state and the flight object to null
      setSelectedCoPilot(null);
      updatedFlight.coPilot = null;
      
      // Clear input field
      if (coPilotInputRef.current) {
        const input = coPilotInputRef.current.querySelector('input');
        if (input) input.value = '';
      }
    }

    try {
      // Include all current field values to prevent API from clearing other fields
      const updateData: Record<string, any> = {
        id: flight.id,
        originalId: flight.originalId,
        // Include current values for all fields to prevent them from being cleared
        startTime: startTimeInput || flight.startTime,
        endTime: endTimeInput || flight.endTime,
        status: flight.status,
        isSchoolFlight: isSchoolFlightChecked,
        startField: selectedStartField || flight.startField,
        landingField: selectedLandingField !== undefined ? selectedLandingField : flight.landingField,
        launchMethod: selectedLaunchMethod || flight.launchMethod,
      };
      
      // Set the appropriate pilot field to null
      if (pilotType === 'pilot1') {
        updateData.pilot = null;
        updateData.coPilot = selectedCoPilot || flight.coPilot; // Preserve co-pilot
      } else {
        updateData.pilot = selectedPilot || flight.pilot; // Preserve pilot
        updateData.coPilot = null;
      }
      
      console.log(`Directly removing ${pilotType} with data:`, JSON.stringify(updateData, null, 2));

      // Use different endpoint based on whether this is historical or not
      const endpoint = isHistorical ? '/api/tablet/historical_edit_flight' : '/api/tablet/edit_flight';
      
      // Add historical date to the payload if needed
      const finalPayload = isHistorical && historicalDate ? {
        ...updateData,
        date: `${historicalDate.getFullYear()}-${String(historicalDate.getMonth() + 1).padStart(2, '0')}-${String(historicalDate.getDate()).padStart(2, '0')}`
      } : updateData;

      // Call the API endpoint directly
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(finalPayload),
      });

      const data = await response.json();

      if (!data.success) {
        setError(`Failed to remove ${pilotType === 'pilot1' ? 'pilot' : 'co-pilot'}: ${data.error || 'Unknown error'}`);
        return false;
      }
      
      // Update parent component with a COPY of the updated flight, 
      // not a reference - this is critical to prevent state issues
      onSave({...updatedFlight});
      
      // Explicitly set the local flight state to enforce the update
      if (pilotType === 'pilot1') {
        // Override the flight with pilot1 removed
        flight.pilot = null;
      } else {
        // Override the flight with pilot2 removed
        flight.coPilot = null;
      }
      
      return true;
    } catch (err) {
      console.error(`Error removing ${pilotType}:`, err);
      setError(`Failed to remove ${pilotType === 'pilot1' ? 'pilot' : 'co-pilot'}`);
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  // Simplify the remove handlers to just call removePilotDirectly
  const handleRemovePilot = () => {
    removePilotDirectly('pilot1');
  };

  // Update the handleRemoveCoPilot function
  const handleRemoveCoPilot = () => {
    removePilotDirectly('pilot2');
  };

  // Modify the handleSaveToDatabase function to correctly handle all fields
  const handleSaveToDatabase = async (flightToSave = flight) => {
    if (!flightToSave) return;
    
    setIsSaving(true);
    setError(null);
    
    try {
      // Determine the status based on start/end times
      let updatedStatus = flightToSave.status;
      
      // If there's an end time, set status to completed
      if (endTimeInput && endTimeInput.trim() !== '') {
        updatedStatus = 'completed';
      } 
      // If there's a start time but no end time, set status to in_flight
      else if (startTimeInput && startTimeInput.trim() !== '') {
        updatedStatus = 'in_flight';
      }
      // If no times are set, default to pending
      else {
        updatedStatus = 'pending';
      }
      
      console.log(`Setting status to ${updatedStatus} based on start time: ${startTimeInput}, end time: ${endTimeInput}`);
      
      // For single-seater aircraft, always set coPilot to null
      const finalCoPilot = flightToSave.aircraft.isDoubleSeater ? selectedCoPilot : null;
      
      // Prepare complete data for the API with all necessary fields
      const dataToSend = {
        id: flightToSave.id,
        originalId: flightToSave.originalId,
        pilot: selectedPilot, // Use the current state value
        coPilot: finalCoPilot, // Use appropriate co-pilot value based on aircraft type
        startTime: startTimeInput, // Use state value - time utils will handle conversion on server
        endTime: endTimeInput, // Use state value - time utils will handle conversion on server
        status: updatedStatus, // Use calculated status
        isSchoolFlight: isSchoolFlightChecked,
        startField: selectedStartField,
        landingField: selectedLandingField,
        launchMethod: selectedLaunchMethod,
      };
      
      console.log('Saving to database:', JSON.stringify(dataToSend, null, 2));
      
      // Use different endpoint based on whether this is historical or not
      const endpoint = isHistorical ? '/api/tablet/historical_edit_flight' : '/api/tablet/edit_flight';
      
      // Add historical date to the payload if needed
      const finalPayload = isHistorical && historicalDate ? {
        ...dataToSend,
        date: `${historicalDate.getFullYear()}-${String(historicalDate.getMonth() + 1).padStart(2, '0')}-${String(historicalDate.getDate()).padStart(2, '0')}`
      } : dataToSend;
      
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(finalPayload),
      });

      const data = await response.json();

      if (data.success) {
        // Create a complete updated flight object to pass to the parent
        const completedFlightUpdate: Flight = {
          ...flightToSave,
          pilot: selectedPilot,
          coPilot: finalCoPilot,
          startTime: startTimeInput || null,
          endTime: endTimeInput || null,
          status: updatedStatus,
          isSchoolFlight: isSchoolFlightChecked,
          startField: selectedStartField,
          landingField: selectedLandingField,
          launchMethod: selectedLaunchMethod,
        };
        
        // Update the parent component before closing
        onSave(completedFlightUpdate);
        
        // Now close the dialog
        onOpenChange(false);
      } else {
        setError(`Failed to save: ${data.error || 'Unknown error'}`);
      }
    } catch (err) {
      console.error('Error saving flight:', err);
      setError('Failed to save the flight data.');
    } finally {
      setIsSaving(false);
    }
  };

  // Add handlers for directly entering time
  const handleTimeInput = (type: "start" | "end", value: string) => {
    // Basic time validation for HH:MM format
    const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
    if (value && !timeRegex.test(value)) {
      // Don't update if format is invalid
      return;
    }
    
    console.log(`Setting ${type} time to:`, value);
    // We'll let the save button handle the actual save
  }

  const handleDeleteEndTime = () => {
    if (!flight) return;
    
    // Update the state - clear both end time and landing field
    setEndTimeInput("");
    setSelectedLandingField(null);
    
    // Create a copy of the flight with updated fields
    const updatedStatus = 'in_flight';
    
    // For single-seater aircraft, always set coPilot to null
    const finalCoPilot = flight.aircraft.isDoubleSeater ? selectedCoPilot : null;
    
    // Prepare data to save
    const dataToSend = {
      id: flight.id,
      originalId: flight.originalId,
      pilot: selectedPilot,
      coPilot: finalCoPilot,
      startTime: startTimeInput, // Time utils will handle conversion on server
      endTime: null, // Explicitly null
      status: updatedStatus,
      isSchoolFlight: isSchoolFlightChecked,
      startField: selectedStartField,
      landingField: null, // Explicitly clear landing field as well
      launchMethod: selectedLaunchMethod,
    };
    
    console.log("Deleting end time and landing field:", JSON.stringify(dataToSend, null, 2));
    
    setIsSaving(true);
    setError(null);
    
    // Use different endpoint based on whether this is historical or not
    const endpoint = isHistorical ? '/api/tablet/historical_edit_flight' : '/api/tablet/edit_flight';
    
    // Add historical date to the payload if needed
    const finalPayload = isHistorical && historicalDate ? {
      ...dataToSend,
      date: `${historicalDate.getFullYear()}-${String(historicalDate.getMonth() + 1).padStart(2, '0')}-${String(historicalDate.getDate()).padStart(2, '0')}`
    } : dataToSend;
    
    fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(finalPayload),
    })
    .then(response => response.json())
    .then(data => {
      if (data.success) {
        // Create a complete updated flight object to pass to the parent
        const completedFlightUpdate: Flight = {
          ...flight,
          pilot: selectedPilot,
          coPilot: finalCoPilot,
          startTime: startTimeInput || null,
          endTime: null, // Explicitly null for delete end time
          status: updatedStatus,
          isSchoolFlight: isSchoolFlightChecked,
          startField: selectedStartField,
          landingField: null, // Also clear landing field in state
          launchMethod: selectedLaunchMethod,
        };
        
        // Update the parent component before closing
        onSave(completedFlightUpdate);
        
        // Close dialog on success
        onOpenChange(false);
      } else {
        setError(`Failed to save: ${data.error || 'Unknown error'}`);
      }
    })
    .catch(err => {
      console.error('Error saving flight:', err);
      setError('Failed to save the flight data.');
    })
    .finally(() => {
      setIsSaving(false);
    });
  };

  // Add a separate handler for the save button click
  const handleSaveButtonClick = () => {
    handleSaveToDatabase();
  };

  // Note dialog handlers
  const handleNoteButtonClick = () => {
    setShowNoteDialog(true);
  };

  const handleNotesUpdated = (newNotes: string) => {
    setCurrentNotes(newNotes);
    // Update the flight object with the new notes
    if (flight) {
      const updatedFlight = {
        ...flight,
        notes: newNotes
      };
      
      // Update the flight in the parent component so changes are reflected in the main list
      onSave(updatedFlight);
    }
  };

  return (
    <>
      {isMobile ? (
        <Drawer open={open} onOpenChange={(isOpen) => {
          // Only call onOpenChange without saving
          onOpenChange(isOpen);
        }}>
          <DrawerContent className="max-h-[95vh]">
            <DrawerHeader>
              <DrawerTitle>Rediger Flyvning</DrawerTitle>
              <DrawerDescription>
                {`${flight.aircraft.registration} (${flight.aircraft.type})`}
              </DrawerDescription>
            </DrawerHeader>
            <div className="overflow-y-auto px-4 pb-4">
              <div className="grid gap-4">
                {/* Display error message */}
                {error && (
                  <div className="text-sm text-red-500 p-2 bg-red-50 rounded border border-red-200">
                    {error}
                  </div>
                )}

                {/* Aircraft display with FLARM */}
                <div className="flex items-center gap-2">
                  <Input
                    value={`${flight.aircraft.registration} (${flight.aircraft.type})`}
                    disabled
                    className="h-12 text-base flex-1"
                  />
                  {flight.aircraft.hasFlarm && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="bg-white rounded-md p-1 border border-gray-200 flex items-center justify-center h-12 w-16">
                            <Image
                              src="/images/flarm-logo.png"
                              alt="FLARM"
                              width={72}
                              height={24}
                              className="h-6 w-auto object-contain"
                            />
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>FLARM Collision Avoidance System</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                </div>

                {/* Pilot fields */}
                <div className="grid gap-3">
                  {/* First Pilot */}
                  <div className="grid gap-1">
                    <Label className="text-sm font-medium">1. Pilot</Label>
                    <div className="flex gap-2">
                      <div className="flex-1" ref={pilotInputRef}>
                        <Combobox
                          items={allPilotOptions.map((pilot) => ({
                            label: pilot.name,
                            value: pilot.id.toString(),
                          }))}
                          value={selectedPilot?.id === "guest" ? selectedPilot.name : (selectedPilot?.id?.toString() || "")}
                          onChange={handlePilotChange}
                          onTextChange={(text) => {
                            if (text) {
                              const manualPilot = { id: "guest", name: text };
                              setSelectedPilot(manualPilot);
                            }
                          }}
                          placeholder="Vælg pilot eller indtast navn"
                          tallDropdown={true}
                          customButtonText='Tilføj "{value}" som gæstepilot'
                        />
                        {selectedPilot?.id === "guest" && (
                          <div className="text-sm mt-1 text-blue-600 font-medium">
                            Gæstepilot: {selectedPilot.name}
                          </div>
                        )}
                      </div>
                      {(selectedPilot || flight.pilot) && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-[48px] w-12 flex-shrink-0"
                          onClick={handleRemovePilot}
                        >
                          ✕
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Second Pilot - only for double seaters */}
                  {flight.aircraft.isDoubleSeater && (
                    <div className="grid gap-1">
                      <Label className="text-sm font-medium">2. Pilot/Instruktør</Label>
                      <div className="flex gap-2">
                        <div className="flex-1" ref={coPilotInputRef}>
                          <Combobox
                            items={allPilotOptions.map((pilot) => ({
                              label: pilot.name,
                              value: pilot.id.toString(),
                            }))}
                            value={selectedCoPilot?.id === "guest" ? selectedCoPilot.name : (selectedCoPilot?.id?.toString() || "")}
                            onChange={handleCoPilotChange}
                            onTextChange={(text) => {
                              if (text) {
                                const manualCoPilot = { id: "guest", name: text };
                                setSelectedCoPilot(manualCoPilot);
                              }
                            }}
                            placeholder="Vælg pilot eller indtast navn"
                            tallDropdown={true}
                            customButtonText='Tilføj "{value}" som gæstepilot'
                          />
                          {selectedCoPilot?.id === "guest" && (
                            <div className="text-sm mt-1 text-blue-600 font-medium">
                              Gæstepilot: {selectedCoPilot.name}
                            </div>
                          )}
                        </div>
                        {(selectedCoPilot || flight.coPilot) && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-[48px] w-12 flex-shrink-0"
                            onClick={handleRemoveCoPilot}
                          >
                            ✕
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Airfields */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-1">
                    <Label className="text-sm font-medium">Startplads</Label>
                    <Select 
                      value={selectedStartField || flight.startField} 
                      onValueChange={handleStartFieldChange}
                    >
                      <SelectTrigger className="h-12 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {airfieldOptions.map((field) => (
                          <SelectItem key={field.id} value={field.id}>
                            {field.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid gap-1">
                    <Label className="text-sm font-medium">Landingsplads</Label>
                    <Select
                      value={selectedLandingField || flight.landingField || "none"}
                      onValueChange={handleLandingFieldChange}
                    >
                      <SelectTrigger className="h-12 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Ikke angivet</SelectItem>
                        <SelectItem value="Udelanding">Udelanding</SelectItem>
                        {airfieldOptions.map((field) => (
                          <SelectItem key={field.id} value={field.id}>
                            {field.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* School flight and launch method */}
                <div className="grid grid-cols-2 gap-3">
                  <div 
                    className="flex items-center space-x-2 p-3 bg-slate-50 rounded-lg border cursor-pointer"
                    onClick={() => handleSchoolFlightChange(!isSchoolFlightChecked)}
                  >
                    <Checkbox
                      checked={isSchoolFlightChecked}
                      onCheckedChange={(checked) => handleSchoolFlightChange(checked as boolean)}
                      className="h-5 w-5"
                    />
                    <Label className="text-sm font-medium cursor-pointer">
                      Skoleflyning
                    </Label>
                  </div>

                  <div className="grid gap-1">
                    <Label className="text-sm font-medium">Startmetode</Label>
                    <Select
                      value={selectedLaunchMethod}
                      onValueChange={handleLaunchMethodChange}
                    >
                      <SelectTrigger className="h-12 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="S">Spilstart (S)</SelectItem>
                        <SelectItem value="M">Selvstart (M)</SelectItem>
                        <SelectItem value="F">Flyslæb (F)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Time inputs */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-1">
                    <Label className="text-sm font-medium">Starttid</Label>
                    <div className="flex gap-2">
                      <Input
                        className="h-12 text-sm"
                        placeholder="TT:MM"
                        value={startTimeInput}
                        onChange={(e) => setStartTimeInput(e.target.value)}
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-12 w-12 flex-shrink-0"
                        onClick={() => onTimeClick(flight.id, "start")}
                      >
                        <Clock className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <div className="grid gap-1">
                    <Label className="text-sm font-medium">Sluttid</Label>
                    <div className="flex gap-2">
                      <Input
                        className="h-12 text-sm"
                        placeholder="TT:MM"
                        value={endTimeInput}
                        onChange={(e) => setEndTimeInput(e.target.value)}
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-12 w-12 flex-shrink-0"
                        onClick={() => onTimeClick(flight.id, "end")}
                      >
                        <Clock className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>

                {/* FLARM Status and Delete End Time */}
                {flight.endTime || isPrivatePlane ? (
                  <div className="grid gap-2">
                    {flight.endTime && (
                      <Button
                        variant="outline"
                        className="h-12 text-sm w-full"
                        onClick={handleDeleteEndTime}
                      >
                        <PlaneTakeoff className="mr-2 h-4 w-4" />
                        Slet sluttidspunkt (fortsæt flyvning)
                      </Button>
                    )}
                    {isPrivatePlane && (
                      <Button
                        variant="outline"
                        className="h-12 text-sm w-full bg-purple-50 border-purple-200 text-purple-700 hover:bg-purple-100"
                        onClick={removePrivatePlaneStatus}
                        disabled={isLoadingPrivateStatus}
                      >
                        <RotateCcw className="mr-2 h-4 w-4" />
                        {isLoadingPrivateStatus ? 'Fjerner...' : 'Fjern som privat fly for i dag'}
                      </Button>
                    )}
                  </div>
                ) : null}
              </div>
            </div>
            <DrawerFooter>
              <div className="grid grid-cols-4 gap-2">
                <DrawerClose asChild>
                  <Button variant="outline" className="h-12">
                    Annuller
                  </Button>
                </DrawerClose>
                <Button 
                  variant="outline" 
                  className="h-12" 
                  onClick={handleNoteButtonClick}
                >
                  <FileText className="mr-1 h-4 w-4" />
                  Noter
                </Button>
                <Button 
                  variant="destructive" 
                  className="h-12" 
                  onClick={handleDeleteClick}
                  disabled={isDeleting}
                >
                  <Trash className="mr-1 h-4 w-4" />
                  Slet
                </Button>
                <Button 
                  className="h-12" 
                  onClick={handleSaveButtonClick}
                  disabled={isSaving}
                >
                  {isSaving ? "Gemmer..." : "Gem"}
                </Button>
              </div>
            </DrawerFooter>
          </DrawerContent>
        </Drawer>
      ) : (
        <Dialog open={open} onOpenChange={(isOpen) => {
          // Only call onOpenChange without saving
          onOpenChange(isOpen);
        }}>
          <DialogContent className="sm:max-w-[500px] pt-4">
            <div className="grid gap-4 py-2">
              <div className="grid gap-2">
                <Label htmlFor="edit-aircraft" className="text-base">
                  Fly
                </Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="edit-aircraft"
                    value={`${flight.aircraft.registration} (${flight.aircraft.type})`}
                    disabled
                    className="h-12 text-base flex-1"
                  />
                  {flight.aircraft.hasFlarm && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="bg-white rounded-md p-1 border border-gray-200 flex items-center justify-center h-12 w-16">
                            <Image
                              src="/images/flarm-logo.png"
                              alt="FLARM"
                              width={72}
                              height={24}
                              className="h-6 w-auto object-contain"
                            />
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>FLARM Collision Avoidance System</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                </div>
              </div>

              {/* Display error message */}
              {error && (
                <div className="text-sm text-red-500 p-2 bg-red-50 rounded border border-red-200">
                  {error}
                </div>
              )}

              {/* Pilot fields with more compact styling */}
              <div className="grid gap-3">
                {/* First Pilot - more compact */}
                <div className="grid gap-1">
                  <Label htmlFor="edit-pilot" className="text-sm font-medium">
                    1. Pilot
                  </Label>
                  <div className="flex gap-2">
                    <div className="flex-1" ref={pilotInputRef}>
                      <Combobox
                        items={allPilotOptions.map((pilot) => ({
                          label: pilot.name,
                          value: pilot.id.toString(),
                        }))}
                        value={selectedPilot?.id === "guest" ? selectedPilot.name : (selectedPilot?.id?.toString() || "")}
                        onChange={handlePilotChange}
                        onTextChange={(text) => {
                          if (text) {
                            const manualPilot = { id: "guest", name: text };
                            setSelectedPilot(manualPilot);
                          }
                        }}
                        placeholder="Vælg pilot eller indtast navn"
                        tallDropdown={true}
                        customButtonText='Tilføj "{value}" som gæstepilot'
                      />
                      {selectedPilot?.id === "guest" && (
                        <div className="text-sm mt-1 text-blue-600 font-medium">
                          Gæstepilot: {selectedPilot.name}
                        </div>
                      )}
                    </div>
                    {(selectedPilot || flight.pilot) && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-[48px] w-12 flex-shrink-0"
                        onClick={handleRemovePilot}
                        title="Fjern pilot"
                      >
                        ✕
                      </Button>
                    )}
                  </div>
                </div>

                {/* Second Pilot - only show for double seaters */}
                {flight.aircraft.isDoubleSeater && (
                  <div className="grid gap-1">
                    <Label htmlFor="edit-copilot" className="text-sm font-medium">
                      2. Pilot/Instruktør
                    </Label>
                    <div className="flex gap-2">
                      <div className="flex-1" ref={coPilotInputRef}>
                        <Combobox
                          items={allPilotOptions.map((pilot) => ({
                            label: pilot.name,
                            value: pilot.id.toString(),
                          }))}
                          value={selectedCoPilot?.id === "guest" ? selectedCoPilot.name : (selectedCoPilot?.id?.toString() || "")}
                          onChange={handleCoPilotChange}
                          onTextChange={(text) => {
                            if (text) {
                              const manualCoPilot = { id: "guest", name: text };
                              setSelectedCoPilot(manualCoPilot);
                            }
                          }}
                          placeholder="Vælg pilot eller indtast navn"
                          tallDropdown={true}
                          customButtonText='Tilføj "{value}" som gæstepilot'
                        />
                        {selectedCoPilot?.id === "guest" && (
                          <div className="text-sm mt-1 text-blue-600 font-medium">
                            Gæstepilot: {selectedCoPilot.name}
                          </div>
                        )}
                      </div>
                      {(selectedCoPilot || flight.coPilot) && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-[48px] w-12 flex-shrink-0"
                          onClick={handleRemoveCoPilot}
                          title="Fjern andenpilot"
                        >
                          ✕
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Airfield and checkbox fields - more compact */}
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1">
                  <Label htmlFor="edit-start-field" className="text-base font-medium">
                    Startplads
                  </Label>
                  <Select 
                    value={selectedStartField || flight.startField} 
                    onValueChange={handleStartFieldChange}
                  >
                    <SelectTrigger id="edit-start-field" className="h-14 text-base px-4">
                      <SelectValue placeholder="Vælg startplads" />
                    </SelectTrigger>
                    <SelectContent>
                      {airfieldOptions.map((field) => (
                        <SelectItem key={field.id} value={field.id} className="text-base py-3">
                          {field.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-1">
                  <Label htmlFor="edit-landing-field" className="text-base font-medium">
                    Landingsplads
                  </Label>
                  <Select
                    value={selectedLandingField || flight.landingField || "none"}
                    onValueChange={handleLandingFieldChange}
                  >
                    <SelectTrigger id="edit-landing-field" className="h-14 text-base px-4">
                      <SelectValue placeholder="Vælg landingsplads" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none" className="text-base py-3">Ikke angivet</SelectItem>
                      <SelectItem value="Udelanding" className="text-base py-3">Udelanding</SelectItem>
                      {airfieldOptions.map((field) => (
                        <SelectItem key={field.id} value={field.id} className="text-base py-3">
                          {field.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div 
                  className="flex items-center space-x-3 my-1 p-3 bg-slate-50 rounded-lg border border-slate-200 cursor-pointer"
                  onClick={() => handleSchoolFlightChange(!isSchoolFlightChecked)}
                >
                  <Checkbox
                    id="edit-school-flight"
                    checked={isSchoolFlightChecked}
                    onCheckedChange={(checked) => handleSchoolFlightChange(checked as boolean)}
                    className="h-6 w-6"
                  />
                  <Label htmlFor="edit-school-flight" className="text-lg font-medium cursor-pointer">
                    Skoleflyning
                  </Label>
                </div>

                <div className="grid gap-1">
                  <Label htmlFor="edit-launch-method" className="text-base font-medium">
                    Startmetode
                  </Label>
                  <Select
                    value={selectedLaunchMethod}
                    onValueChange={handleLaunchMethodChange}
                  >
                    <SelectTrigger id="edit-launch-method" className="h-14 text-base px-4">
                      <SelectValue placeholder="Vælg startmetode" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="S" className="text-base py-3">Spilstart (S)</SelectItem>
                      <SelectItem value="M" className="text-base py-3">Selvstart (M)</SelectItem>
                      <SelectItem value="F" className="text-base py-3">Flyslæb (F)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Time inputs - larger for tablets */}
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1">
                  <Label htmlFor="edit-start-time" className="text-base font-medium">
                    Starttid
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      id="edit-start-time"
                      className="h-14 text-base px-4"
                      placeholder="TT:MM"
                      value={startTimeInput}
                      onChange={(e) => setStartTimeInput(e.target.value)}
                    />
                    <Button
                      variant="outline"
                      size="lg"
                      className="h-14 w-14 flex-shrink-0"
                      onClick={() => onTimeClick(flight.id, "start")}
                    >
                      <Clock className="h-6 w-6" />
                    </Button>
                  </div>
                </div>
                <div className="grid gap-1">
                  <Label htmlFor="edit-end-time" className="text-base font-medium">
                    Sluttid
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      id="edit-end-time"
                      className="h-14 text-base px-4"
                      placeholder="TT:MM"
                      value={endTimeInput}
                      onChange={(e) => setEndTimeInput(e.target.value)}
                    />
                    <Button
                      variant="outline"
                      size="lg"
                      className="h-14 w-14 flex-shrink-0"
                      onClick={() => onTimeClick(flight.id, "end")}
                    >
                      <Clock className="h-6 w-6" />
                    </Button>
                  </div>
                </div>
              </div>

              {/* FLARM Status and Delete End Time */}
              {flight.endTime || isPrivatePlane ? (
                <div className="grid gap-2">
                  {flight.endTime && (
                    <Button
                      variant="outline"
                      className="h-12 text-sm w-full"
                      onClick={handleDeleteEndTime}
                    >
                      <PlaneTakeoff className="mr-2 h-4 w-4" />
                      Slet sluttidspunkt (fortsæt flyvning)
                    </Button>
                  )}
                  {isPrivatePlane && (
                    <Button
                      variant="outline"
                      className="h-12 text-sm w-full bg-purple-50 border-purple-200 text-purple-700 hover:bg-purple-100"
                      onClick={removePrivatePlaneStatus}
                      disabled={isLoadingPrivateStatus}
                    >
                      <RotateCcw className="mr-2 h-4 w-4" />
                      {isLoadingPrivateStatus ? 'Fjerner...' : 'Fjern som privat fly for i dag'}
                    </Button>
                  )}
                </div>
              ) : null}
            </div>
            <DialogFooter className="pt-4">
              <div className="flex w-full gap-3">
                <Button 
                  variant="outline" 
                  size="lg" 
                  className="h-14 px-4 text-lg font-medium flex-1" 
                  onClick={() => onOpenChange(false)}
                >
                  Annuller
                </Button>
                <Button 
                  variant="outline" 
                  size="lg" 
                  className="h-14 px-4 text-lg font-medium flex-1" 
                  onClick={handleNoteButtonClick}
                >
                  <FileText className="mr-2 h-5 w-5" />
                  Noter
                </Button>
                <Button 
                  variant="destructive" 
                  size="lg" 
                  className="h-14 px-4 text-lg font-medium flex-1" 
                  onClick={handleDeleteClick}
                  disabled={isDeleting}
                >
                  <Trash className="mr-2 h-5 w-5" />
                  Slet
                </Button>
                <Button 
                  size="lg" 
                  className="h-14 px-4 text-lg font-medium flex-1" 
                  onClick={handleSaveButtonClick}
                  disabled={isSaving}
                >
                  {isSaving ? "Gemmer..." : "Gem"}
                </Button>
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Delete Confirmation Dialog */}
      {isMobile ? (
        <Drawer open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
          <DrawerContent className="max-h-[80vh]">
            <DrawerHeader>
              <DrawerTitle>Bekræft Sletning</DrawerTitle>
              <DrawerDescription>
                Er du sikker på, at du vil slette denne flyvning?
              </DrawerDescription>
            </DrawerHeader>
            
            <div className="px-4 pb-4">
              {error && (
                <Alert variant="destructive" className="mb-4">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Fejl</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Advarsel</AlertTitle>
                <AlertDescription>
                  Denne handling vil markere flyvningen som slettet. Den vil stadig være synlig i sektionen "Slettede Flyvninger".
                </AlertDescription>
              </Alert>
            </div>
            
            <DrawerFooter>
              <div className="grid grid-cols-2 gap-2">
                <DrawerClose asChild>
                  <Button 
                    variant="outline" 
                    className="h-12" 
                    disabled={isDeleting}
                  >
                    Annuller
                  </Button>
                </DrawerClose>
                <Button 
                  variant="destructive" 
                  className="h-12" 
                  onClick={handleDeleteConfirm}
                  disabled={isDeleting}
                >
                  {isDeleting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Sletter...
                    </>
                  ) : (
                    'Bekræft Sletning'
                  )}
                </Button>
              </div>
            </DrawerFooter>
          </DrawerContent>
        </Drawer>
      ) : (
        <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
          <DialogContent className="sm:max-w-[450px]">
            <DialogHeader>
              <DialogTitle className="text-xl">Bekræft Sletning</DialogTitle>
              <DialogDescription className="text-base">
                Er du sikker på, at du vil slette denne flyvning?
              </DialogDescription>
            </DialogHeader>
            
            {error && (
              <Alert variant="destructive" className="mt-2">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Fejl</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            
            <Alert variant="destructive" className="mt-2">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Advarsel</AlertTitle>
              <AlertDescription>
                Denne handling vil markere flyvningen som slettet. Den vil stadig være synlig i sektionen &quot;Slettede
                Flyvninger&quot;.
              </AlertDescription>
            </Alert>
            
            <DialogFooter className="mt-4">
              <div className="flex w-full justify-between gap-4">
                <Button 
                  variant="outline" 
                  size="lg" 
                  className="h-14 px-5 text-lg font-medium flex-1" 
                  onClick={() => setShowDeleteConfirm(false)}
                  disabled={isDeleting}
                >
                  Annuller
                </Button>
                <Button 
                  variant="destructive" 
                  size="lg" 
                  className="h-14 px-5 text-lg font-medium flex-1" 
                  onClick={handleDeleteConfirm}
                  disabled={isDeleting}
                >
                  {isDeleting ? (
                    <>
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                      Sletter...
                    </>
                  ) : (
                    'Bekræft Sletning'
                  )}
                </Button>
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Note Dialog */}
      <NoteDialog
        open={showNoteDialog}
        onOpenChange={setShowNoteDialog}
        flightId={flight.id.toString()}
        originalId={flight.originalId}
        currentNotes={currentNotes}
        onNotesUpdated={handleNotesUpdated}
        flightInfo={{
          registration: flight.aircraft.registration,
          pilot1Name: flight.pilot?.name,
          pilot2Name: flight.coPilot?.name,
          takeoffTime: flight.startTime ? new Date(`2024-01-01T${flight.startTime}:00`) : undefined,
        }}
      />
    </>
  )
}

