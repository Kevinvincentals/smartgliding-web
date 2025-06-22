"use client"

import { useState, useEffect, useRef } from "react"
import Image from "next/image"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Drawer,
  DrawerContent,
  DrawerFooter,
  DrawerTrigger,
  DrawerClose,
} from "@/components/ui/drawer"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Combobox } from "@/components/ui/combobox"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Plus, MapPin, X, Check, Plane, Users, GraduationCap, RotateCcw, Radio } from "lucide-react"
import type { Aircraft, Pilot, AirfieldOption, LaunchMethod } from "@/types/flight"
import toast, { Toaster } from 'react-hot-toast';
import { useIsMobile } from "@/hooks/use-mobile"

interface AddFlightDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onAddFlight: (
    aircraft: Aircraft | null,
    pilot: Pilot | null,
    coPilot: Pilot | null,
    isSchoolFlight: boolean,
    startField: string,
    launchMethod: LaunchMethod,
    socket: WebSocket | null
  ) => void
  airfieldOptions: AirfieldOption[]
  socket: WebSocket | null
}

export function AddFlightDialog({
  open,
  onOpenChange,
  onAddFlight,
  airfieldOptions,
  socket,
}: AddFlightDialogProps) {
  const [newFlight, setNewFlight] = useState({
    aircraftId: "",
    customAircraft: "",
    pilotId: "",
    customPilot: "",
    coPilotId: "",
    customCoPilot: "",
    isSchoolFlight: false,
    startField: "", // Initialize empty and let the useEffect set it
    launchMethod: "S" as LaunchMethod, // Default to Spilstart
  })

  const [selectedAircraft, setSelectedAircraft] = useState<Aircraft | null>(null)
  const [aircraftOptions, setAircraftOptions] = useState<Aircraft[]>([])
  const [pilotOptions, setPilotOptions] = useState<Pilot[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isDataLoading, setIsDataLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  // Add state for private plane functionality
  const [isPrivatePlane, setIsPrivatePlane] = useState(false)
  const [isLoadingPrivatePlanes, setIsLoadingPrivatePlanes] = useState(false)
  const [privatePlaneAssignments, setPrivatePlaneAssignments] = useState<any[]>([])
  
  // Add refs for each combobox
  const aircraftComboboxRef = useRef<HTMLDivElement>(null);
  const pilotComboboxRef = useRef<HTMLDivElement>(null);
  const coPilotComboboxRef = useRef<HTMLDivElement>(null);

  const isMobile = useIsMobile();

  // Fetch planes and pilots when dialog opens
  useEffect(() => {
    if (open) {
      fetchPlanesAndPilots();
    }
  }, [open]);

  // Add useEffect to update startField when airfieldOptions changes
  useEffect(() => {
    if (airfieldOptions && airfieldOptions.length > 0) {
      setNewFlight(prev => ({
        ...prev,
        startField: airfieldOptions[0].id
      }));
    }
  }, [airfieldOptions]);

  const fetchPlanesAndPilots = async () => {
    setIsDataLoading(true);
    setError(null);
    
    try {
      // Fetch planes - clubId will be handled by the API with defaults
      const planesResponse = await fetch(`/api/tablet/fetch_planes`);
      if (!planesResponse.ok) {
        throw new Error('Failed to fetch planes');
      }
      
      const planesData = await planesResponse.json();
      if (planesData.success && planesData.planes) {
        setAircraftOptions(planesData.planes);
      }
      
      // Fetch pilots - clubId will be handled by the API with defaults
      const pilotsResponse = await fetch(`/api/tablet/fetch_pilots`);
      if (!pilotsResponse.ok) {
        throw new Error('Failed to fetch pilots');
      }
      
      const pilotsData = await pilotsResponse.json();
      if (pilotsData.success && pilotsData.pilots) {
        setPilotOptions(pilotsData.pilots);
      }

      // Fetch private plane assignments for today
      const privatePlanesResponse = await fetch(`/api/tablet/private_planes`);
      if (privatePlanesResponse.ok) {
        const privatePlanesData = await privatePlanesResponse.json();
        if (privatePlanesData.success && privatePlanesData.privatePlanes) {
          setPrivatePlaneAssignments(privatePlanesData.privatePlanes);
        }
      }
    } catch (err) {
      console.error('Error fetching data:', err);
      setError('Failed to load necessary data. Please try again.');
    } finally {
      setIsDataLoading(false);
    }
  };

  // Function to auto-fill pilot information for private planes
  const autoFillPrivatePlaneInfo = (aircraft: Aircraft) => {
    if (!aircraft || !aircraft.id) return;

    // Find private plane assignment for this aircraft
    const privateAssignment = privatePlaneAssignments.find(pp => pp.planeId === aircraft.id.toString());
    
    if (privateAssignment) {
      console.log('Found private plane assignment:', privateAssignment);
      
      // Auto-fill pilot information
      if (privateAssignment.pilot1) {
        // Club member pilot
        setNewFlight(prev => ({
          ...prev,
          pilotId: privateAssignment.pilot1.id,
          customPilot: ""
        }));
      } else if (privateAssignment.guest_pilot1_name) {
        // Guest pilot
        setNewFlight(prev => ({
          ...prev,
          pilotId: "",
          customPilot: privateAssignment.guest_pilot1_name
        }));
      }

      // Auto-fill co-pilot if it's a double-seater
      if (aircraft.isDoubleSeater) {
        if (privateAssignment.pilot2) {
          // Club member co-pilot
          setNewFlight(prev => ({
            ...prev,
            coPilotId: privateAssignment.pilot2.id,
            customCoPilot: ""
          }));
        } else if (privateAssignment.guest_pilot2_name) {
          // Guest co-pilot
          setNewFlight(prev => ({
            ...prev,
            coPilotId: "",
            customCoPilot: privateAssignment.guest_pilot2_name
          }));
        }
      }

      // Auto-fill other flight details
      setNewFlight(prev => ({
        ...prev,
        isSchoolFlight: privateAssignment.isSchoolFlight || false,
        launchMethod: privateAssignment.launchMethod || "S",
        startField: privateAssignment.startField || prev.startField
      }));

      // Mark as private plane and auto-check the checkbox
      setIsPrivatePlane(true);

      // Show notification
      toast.success(`Automatisk udfyldt med tildelte piloter for ${aircraft.registration}`, {
        position: 'top-center'
      });
    }
  };

  const handleAircraftChange = async (value: string) => {
    // Check if this is an OGN aircraft selection or a guest entry
    if (value === "guest") {
      try {
        setIsLoading(true);
        const registration = newFlight.customAircraft.trim();
        
        if (!registration) {
          setIsLoading(false);
          return;
        }
        
        // Call the API to add the guest plane
        const response = await fetch('/api/tablet/add_guest_plane', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': process.env.NEXT_PUBLIC_API_KEY || '',
          },
          body: JSON.stringify({
            registration: registration,
            model: 'Unknown Aircraft', 
            competitionId: '',
            flarmId: '',
            isTwoSeater: true, // Always assume two-seater for manually entered planes
            notes: 'Added manually as guest aircraft'
          }),
        });
        
        const data = await response.json();
        if (data.success && data.plane) {
          // Successfully added guest plane
          const guestPlane: Aircraft = {
            id: data.plane.id,
            registration: data.plane.registration,
            type: data.plane.type,
            isDoubleSeater: data.plane.isDoubleSeater,
            hasFlarm: data.plane.hasFlarm,
            competitionId: data.plane.competitionId,
            isGuest: true,
          };
          
          // Update state with the new plane
          setNewFlight({ 
            ...newFlight, 
            aircraftId: guestPlane.id.toString()
          });
          
          setSelectedAircraft(guestPlane);
          
          // Add to aircraftOptions
          setAircraftOptions(prev => [
            ...prev,
            {
              ...guestPlane,
              // Use competitionId from the returned plane data
              competitionId: data.plane.competitionId
            }
          ]);
          
          // Check if this matches any private plane assignment
          autoFillPrivatePlaneInfo(guestPlane);
          
        } else {
          // Fallback handling
          setNewFlight({ 
            ...newFlight, 
            aircraftId: "", 
            customAircraft: registration 
          });
          
          setSelectedAircraft({
            id: Math.floor(Math.random() * 100000),
            registration: registration,
            type: "Unknown Aircraft",
            isDoubleSeater: true,
            hasFlarm: false,
            isGuest: true,
          });
        }
      } catch (error) {
        const registration = newFlight.customAircraft.trim();
        setNewFlight({ 
          ...newFlight, 
          aircraftId: "", 
          customAircraft: registration 
        });
        
        setSelectedAircraft({
          id: Math.floor(Math.random() * 100000),
          registration: registration,
          type: "Unknown Aircraft",
          isDoubleSeater: true,
          hasFlarm: false,
          isGuest: true,
        });
      } finally {
        setIsLoading(false);
      }
    } else if (value.startsWith('ogn_')) {
      try {
        setIsLoading(true);
        // Extract the registration from the OGN value
        const ognData = value.split('_');
        const registration = ognData[1];
        
        // Try to find this registration in the OGN results
        let model = '';
        let competitionId = '';
        let flarmId = '';
        
        // Get competitionId and model from the OGN results if available
        if (newFlight.customAircraft && newFlight.customAircraft.length >= 2) {
          try {
            const response = await fetch(`/api/tablet/fetch_ogn_database?query=${encodeURIComponent(registration)}`);
            if (response.ok) {
              const data = await response.json();
              if (data.success && data.results && data.results.length > 0) {
                // Use the first result that matches our registration exactly
                const exactMatch = data.results.find(
                  (r: any) => r.registration && r.registration.toUpperCase() === registration.toUpperCase()
                );
                
                if (exactMatch) {
                  model = exactMatch.model || '';
                  competitionId = exactMatch.competitionID || '';
                  flarmId = exactMatch.flarmID || '';
                }
              }
            }
          } catch (err) {
            // Silent error handling
          }
        }
        
        // Call the API to add the guest plane
        const response = await fetch('/api/tablet/add_guest_plane', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': process.env.NEXT_PUBLIC_API_KEY || '',
          },
          body: JSON.stringify({
            registration: registration,
            model: model || 'Unknown Aircraft', 
            competitionId: competitionId,
            flarmId: flarmId,
            isTwoSeater: true, // Default to two-seater for safety
            notes: 'Added from OGN database'
          }),
        });
        
        const data = await response.json();
        if (data.success && data.plane) {
          // Successfully added or found guest plane
          const guestPlane: Aircraft = {
            id: data.plane.id,
            registration: data.plane.registration,
            type: data.plane.type,
            isDoubleSeater: data.plane.isDoubleSeater,
            hasFlarm: data.plane.hasFlarm,
            competitionId: data.plane.competitionId,
            isGuest: true, // Mark as guest plane
          };
          
          // Add to local state
          setNewFlight({ 
            ...newFlight, 
            aircraftId: guestPlane.id.toString()
          });
          
          setSelectedAircraft(guestPlane);
          
          // Add this aircraft to the aircraftOptions
          setAircraftOptions(prev => [
            ...prev,
            {
              ...guestPlane,
              // Use competitionId from the returned plane data
              competitionId: data.plane.competitionId
            }
          ]);

          // Check if this matches any private plane assignment
          autoFillPrivatePlaneInfo(guestPlane);
        } else {
          // Fallback to creating a temporary aircraft object
          setNewFlight({ 
            ...newFlight, 
            aircraftId: "", // Clear the ID since this is a custom aircraft
            customAircraft: registration // Set the registration as custom aircraft
          });
          
          const tempAircraft: Aircraft = {
            id: Math.floor(Math.random() * 100000),
            registration: registration,
            type: model || "OGN Registry",
            isDoubleSeater: true, // Default to two-seater for safety
            hasFlarm: !!flarmId, // Has FLARM if we found a FLARM ID
            competitionId: competitionId,
            isGuest: true, // Mark as guest plane
          };
          
          setSelectedAircraft(tempAircraft);
        }
      } catch (error) {
        // Fallback to local handling
        const registration = value.replace('ogn_', '');
        setNewFlight({ 
          ...newFlight, 
          aircraftId: "", 
          customAircraft: registration 
        });
        
        setSelectedAircraft({
          id: Math.floor(Math.random() * 100000),
          registration: registration,
          type: "OGN Registry",
          isDoubleSeater: true,
          hasFlarm: true,
          isGuest: true, // Mark as guest plane
        });
      } finally {
        setIsLoading(false);
      }
    } else {
      // Regular aircraft selection from local database
      setNewFlight({ ...newFlight, aircraftId: value });
      const aircraft = aircraftOptions.find((a) => a.id.toString() === value);
      setSelectedAircraft(aircraft || null);
      
      // Check if this is a private plane and auto-fill pilot info
      if (aircraft) {
        autoFillPrivatePlaneInfo(aircraft);
      }
    }
  }

  // Helper function to format aircraft labels consistently
  const formatAircraftLabel = (aircraft: Aircraft): string => {
    if (!aircraft) return "Select aircraft";
    
    let label = aircraft.registration || "Unknown";
    
    if (aircraft.type) {
      label += ` (${aircraft.type})`;
    }
    
    if (aircraft.competitionId) {
      label += ` [${aircraft.competitionId}]`;
    }
    
    // Add guest plane indicator
    if (aircraft.isGuest) {
      label += " • Gæstefly";
    }
    
    return label;
  };

  const handlePilotChange = (value: string) => {
    // If special "guest" value, use the customPilot value but don't set pilotId
    if (value === "guest") {
      // Just keep the customPilot field as-is, clear the pilotId
      setNewFlight({ ...newFlight, pilotId: "" })
    } else {
      // Regular pilot selected from dropdown
      setNewFlight({ ...newFlight, pilotId: value })
    }
  }

  const handleCoPilotChange = (value: string) => {
    // If special "guest" value, use the customCoPilot value but don't set coPilotId
    if (value === "guest") {
      // Just keep the customCoPilot field as-is, clear the coPilotId
      setNewFlight({ ...newFlight, coPilotId: "" })
    } else {
      // Regular co-pilot selected from dropdown
      setNewFlight({ ...newFlight, coPilotId: value })
    }
  }

  const handleRemovePilot = () => {
    setNewFlight({ ...newFlight, pilotId: "", customPilot: "" });
    // Clear the input field
    if (pilotComboboxRef.current) {
      const input = pilotComboboxRef.current.querySelector('input');
      if (input) input.value = '';
    }
  };

  const handleRemoveCoPilot = () => {
    setNewFlight({ ...newFlight, coPilotId: "", customCoPilot: "" });
    // Clear the input field
    if (coPilotComboboxRef.current) {
      const input = coPilotComboboxRef.current.querySelector('input');
      if (input) input.value = '';
    }
  };

  const handleSubmit = async () => {
    setIsLoading(true);
    setError(null);
    
    let aircraft: Aircraft | null = null;
    let pilot: Pilot | null = null;
    let coPilot: Pilot | null = null;

    // Handle aircraft selection (from dropdown or custom input)
    if (newFlight.aircraftId) {
      // Check if it's from local database or OGN
      if (selectedAircraft) {
        // We already have the selected aircraft, use it directly
        aircraft = selectedAircraft;
      } else {
        // Try to find it in the local database
        aircraft = aircraftOptions.find((a) => a.id.toString() === newFlight.aircraftId) || null;
      }
    } else if (newFlight.customAircraft) {
      try {
        // Try to add the custom aircraft to the database as a guest plane
        const response = await fetch('/api/tablet/add_guest_plane', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': process.env.NEXT_PUBLIC_API_KEY || '',
          },
          body: JSON.stringify({
            registration: newFlight.customAircraft,
            model: 'Unknown Aircraft',
            competitionId: '',
            flarmId: '',
            isTwoSeater: true, // Always assume two-seater for custom aircraft
            notes: 'Added manually as guest aircraft'
          }),
        });
        
        const data = await response.json();
        if (data.success && data.plane) {
          // Use the newly created plane
          aircraft = {
            id: data.plane.id,
            registration: data.plane.registration,
            type: data.plane.type,
            isDoubleSeater: data.plane.isDoubleSeater,
            hasFlarm: data.plane.hasFlarm,
            competitionId: data.plane.competitionId,
            isGuest: true,
          };
        } else {
          // Fallback to a temporary aircraft if the API fails
          aircraft = {
            id: Math.floor(Math.random() * 100000),
            registration: newFlight.customAircraft,
            type: "Unknown Aircraft",
            isDoubleSeater: true, // Always assume two-seater
            hasFlarm: false,
            isGuest: true,
          };
        }
      } catch (error) {
        // Fallback to a temporary aircraft
        aircraft = {
          id: Math.floor(Math.random() * 100000),
          registration: newFlight.customAircraft,
          type: "Unknown Aircraft",
          isDoubleSeater: true, // Always assume two-seater
          hasFlarm: false,
          isGuest: true,
        };
      }
    }

    // Handle pilot selection (from dropdown or custom input)
    if (newFlight.pilotId) {
      pilot = pilotOptions.find((p) => p.id.toString() === newFlight.pilotId) || null;
    } else if (newFlight.customPilot) {
      // Create a custom pilot
      pilot = {
        id: "guest", // Use "guest" id to indicate this is a guest pilot
        name: newFlight.customPilot,
      };
    }

    // Handle co-pilot selection for double seaters
    if (aircraft?.isDoubleSeater) {
      if (newFlight.coPilotId) {
        coPilot = pilotOptions.find((p) => p.id.toString() === newFlight.coPilotId) || null;
      } else if (newFlight.customCoPilot) {
        // Create a custom co-pilot
        coPilot = {
          id: "guest", // Use "guest" id to indicate this is a guest pilot
          name: newFlight.customCoPilot,
        };
      }
    }

    // Validate required fields
    if (!aircraft) {
      setError('Please select or enter an aircraft');
      setIsLoading(false);
      return;
    }

    if (!pilot) {
      setError('Please select or enter a pilot');
      setIsLoading(false);
      return;
    }

    try {
      // No need to provide clubId, API will use default from .env
      const response = await fetch('/api/tablet/add_flight', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          aircraft,
          pilot,
          coPilot,
          isSchoolFlight: newFlight.isSchoolFlight,
          startField: newFlight.startField,
          launchMethod: newFlight.launchMethod
        }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        // Response is successful if we get a 200 status and success is true
        // Update the local state
        onAddFlight(aircraft, pilot, coPilot, newFlight.isSchoolFlight, newFlight.startField, newFlight.launchMethod, socket);
        
        // If private plane is checked, register the private plane assignment
      if (isPrivatePlane && aircraft) {
        try {
          await fetch('/api/tablet/private_planes', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              planeId: aircraft.id.toString(),
                pilot1Id: pilot?.id !== "guest" ? pilot?.id : undefined,
                pilot2Id: coPilot?.id !== "guest" ? coPilot?.id : undefined,
                guest_pilot1_name: pilot?.id === "guest" ? pilot?.name : undefined,
                guest_pilot2_name: coPilot?.id === "guest" ? coPilot?.name : undefined,
                isSchoolFlight: newFlight.isSchoolFlight,
                launchMethod: newFlight.launchMethod,
                startField: newFlight.startField
              }),
            });
          } catch (err) {
            console.error('Error registering private plane:', err);
            // Don't fail the flight creation if private plane registration fails
          }
        }
        
        // Display success notification
        toast.success(`Ny flyvning oprettet${isPrivatePlane ? ' og fly markeret som privat' : ''}`, {
          position: 'top-center'
        });
        
        // Reset form
        setNewFlight({
          aircraftId: "",
          customAircraft: "",
          pilotId: "",
          customPilot: "",
          coPilotId: "",
          customCoPilot: "",
          isSchoolFlight: false,
          startField: airfieldOptions.length > 0 ? airfieldOptions[0].id : "", // Use first airfield option when resetting
          launchMethod: "S" as LaunchMethod,
        });
        setSelectedAircraft(null);
        setIsPrivatePlane(false);
        
        // Clear combobox inputs
        if (aircraftComboboxRef.current) {
          const input = aircraftComboboxRef.current.querySelector('input');
          if (input) input.value = '';
        }
        if (pilotComboboxRef.current) {
          const input = pilotComboboxRef.current.querySelector('input');
          if (input) input.value = '';
        }
        if (coPilotComboboxRef.current) {
          const input = coPilotComboboxRef.current.querySelector('input');
          if (input) input.value = '';
        }
        
        // Close the dialog
        onOpenChange(false);
      } else {
        setError(`Failed to add flight: ${data.error || 'Unknown error'}`);
      }
    } catch (err) {
      setError('Failed to add flight. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <>
      {isMobile ? (
        <Drawer open={open} onOpenChange={onOpenChange}>
          <DrawerTrigger asChild>
            <Button size="lg" className="h-16 w-full text-lg font-medium rounded-xl shadow-md">
              <Plus className="mr-3 h-7 w-7" /> 
              <Plane className="mr-2 h-6 w-6" />
              Tilføj Flyvning
            </Button>
          </DrawerTrigger>
          <DrawerContent className="h-[80vh] flex flex-col">
            <div className="px-4 pb-4 flex-1 flex flex-col min-h-0">
              <div className="grid gap-4 pt-4">
                {error && (
                  <div className="text-sm text-red-500 p-2 bg-red-50 rounded border border-red-200">
                    {error}
                  </div>
                )}

                <div className="grid gap-1">
                  <Label className="text-sm font-medium">
                    Fly
                    {selectedAircraft?.isGuest && (
                      <span className="ml-2 inline-flex items-center px-2 py-1 bg-amber-100 text-amber-800 text-xs font-medium rounded-full border border-amber-200">
                        🌍 Gæstefly
                      </span>
                    )}
                    {selectedAircraft && !selectedAircraft.hasFlarm && (
                      <span className="ml-2 inline-flex items-center px-2 py-1 bg-red-100 text-red-800 text-xs font-medium rounded-full border border-red-200">
                        <Image 
                          src="/images/no-flarm-logo.png" 
                          alt="No FLARM" 
                          width={16} 
                          height={16} 
                          className="mr-1"
                        />
                        Ingen FLARM
                      </span>
                    )}
                    {selectedAircraft && selectedAircraft.hasFlarm && (
                      <span className="ml-2 inline-flex items-center px-2 py-1 bg-green-100 text-green-800 text-xs font-medium rounded-full border border-green-200">
                        <Image 
                          src="/images/flarm-logo.png" 
                          alt="FLARM" 
                          width={16} 
                          height={16} 
                          className="mr-1"
                        />
                        FLARM
                      </span>
                    )}
                  </Label>
                  <div ref={aircraftComboboxRef} className="relative z-[9999]">
                    <Combobox
                      items={aircraftOptions.map((aircraft) => ({
                        label: formatAircraftLabel(aircraft),
                          value: aircraft.id.toString(),
                      }))}
                      value={newFlight.aircraftId}
                      onChange={handleAircraftChange}
                      onTextChange={(text) => {
                        setNewFlight({ ...newFlight, customAircraft: text });
                      }}
                      placeholder="Vælg eller indtast flyregistrering"
                      initialSearchMode={true}
                      tallDropdown={true}
                      searchInOgnDatabase={(inputValue: string) => {
                        // Only search OGN if the input is at least 2 chars
                        if (!inputValue || inputValue.length < 2) return false;
                        
                        // Check if we have any local matches first
                        const normalizedInput = inputValue.toLowerCase();
                        const hasLocalMatches = aircraftOptions.some(aircraft => {
                          // Check registration
                          if (aircraft.registration && 
                              aircraft.registration.toLowerCase().includes(normalizedInput)) {
                            return true;
                          }
                          
                          // Check competition ID
                          if (aircraft.competitionId && 
                              aircraft.competitionId.toLowerCase().includes(normalizedInput)) {
                            return true;
                          }
                          
                          // Check type
                          if (aircraft.type && 
                              aircraft.type.toLowerCase().includes(normalizedInput)) {
                            return true;
                          }
                          
                          return false;
                        });
                        
                        // Only search OGN if we don't have local matches
                        return !hasLocalMatches;
                      }}
                    />
                  </div>
                </div>
                <div className="grid gap-1">
                  <Label className="text-sm font-medium">
                    Pilot
                  </Label>
                  <div className="flex gap-2">
                    <div className="flex-1" ref={pilotComboboxRef}>
                      <Combobox
                        items={pilotOptions.map((pilot) => ({
                          label: pilot.name,
                          value: pilot.id.toString(),
                        }))}
                        value={newFlight.pilotId}
                        onChange={handlePilotChange}
                        onTextChange={(text) => setNewFlight({ ...newFlight, customPilot: text })}
                        placeholder="Vælg klub-pilot eller indtast gæst navn"
                        initialSearchMode={true}
                        tallDropdown={true}
                        customButtonText='Tilføj "{value}" som gæstepilot'
                      />
                    </div>
                    {(newFlight.pilotId || newFlight.customPilot) && (
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
                {selectedAircraft?.isDoubleSeater && (
                  <div className="grid gap-1">
                    <Label className="text-sm font-medium">
                      Bagsæde Pilot / Instruktør
                    </Label>
                    <div className="flex gap-2">
                      <div className="flex-1" ref={coPilotComboboxRef}>
                        <Combobox
                          items={pilotOptions.map((pilot) => ({
                            label: pilot.name,
                            value: pilot.id.toString(),
                          }))}
                          value={newFlight.coPilotId}
                          onChange={handleCoPilotChange}
                          onTextChange={(text) => setNewFlight({ ...newFlight, customCoPilot: text })}
                          placeholder="Vælg klub-pilot eller indtast gæst navn"
                          initialSearchMode={true}
                          tallDropdown={true}
                          customButtonText='Tilføj "{value}" som gæstepilot'
                        />
                      </div>
                      {(newFlight.coPilotId || newFlight.customCoPilot) && (
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
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-1">
                    <Label className="text-sm font-medium">
                      Startplads
                    </Label>
                    <Select
                      value={newFlight.startField}
                      onValueChange={(value) => setNewFlight({ ...newFlight, startField: value })}
                    >
                      <SelectTrigger className="h-16 text-base">
                        <SelectValue placeholder="Vælg startplads" />
                      </SelectTrigger>
                      <SelectContent>
                        {airfieldOptions.map((field) => (
                          <SelectItem key={field.id} value={field.id} className="h-12 text-base">
                            {field.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-1">
                    <Label className="text-sm font-medium">
                      Startmetode
                    </Label>
                    <Select
                      value={newFlight.launchMethod}
                      onValueChange={(value) => setNewFlight({ ...newFlight, launchMethod: value as LaunchMethod })}
                    >
                      <SelectTrigger className="h-16 text-base">
                        <SelectValue placeholder="Vælg startmetode" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="S" className="h-12 text-base">Spilstart (S)</SelectItem>
                        <SelectItem value="M" className="h-12 text-base">Selvstart (M)</SelectItem>
                        <SelectItem value="F" className="h-12 text-base">Flyslæb (F)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div 
                  className="flex items-center space-x-3 p-4 bg-slate-50 rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-100 transition-colors"
                  onClick={() => setNewFlight({ ...newFlight, isSchoolFlight: !newFlight.isSchoolFlight })}
                >
                  <Checkbox
                    checked={newFlight.isSchoolFlight}
                    onCheckedChange={(checked) => setNewFlight({ ...newFlight, isSchoolFlight: checked as boolean })}
                    className="h-6 w-6"
                  />
                  <div className="flex items-center gap-2">
                    <GraduationCap className="h-5 w-5 text-slate-600" />
                    <Label className="text-base font-medium cursor-pointer">
                      Skoleflyning
                    </Label>
                  </div>
                </div>
                
                {/* Private Plane Checkbox */}
                <div 
                  className="flex items-center space-x-3 p-4 bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg border border-blue-200 cursor-pointer hover:from-blue-100 hover:to-purple-100 transition-colors"
                  onClick={() => setIsPrivatePlane(!isPrivatePlane)}
                >
                  <Checkbox
                    checked={isPrivatePlane}
                    onCheckedChange={(checked) => setIsPrivatePlane(checked as boolean)}
                    className="h-6 w-6"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <RotateCcw className="h-5 w-5 text-blue-600" />
                      <Label className="text-base font-medium cursor-pointer">
                        Automatisk pilot tildeling
                      </Label>
                    </div>
                    <div className="text-sm text-blue-600 mt-1">
                      Nye flyvninger i dette fly vil automatisk få tildelt den valgte pilot(er) i dag
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <DrawerFooter>
              <div className="grid grid-cols-2 gap-3">
                <DrawerClose asChild>
                  <Button 
                    variant="outline" 
                    className="h-14 text-base font-medium border-2 hover:bg-gray-50"
                  >
                    <X className="mr-2 h-5 w-5" />
                    Annuller
                  </Button>
                </DrawerClose>
                <Button 
                  size="lg" 
                  className="h-14 px-6 text-lg font-medium flex-1" 
                  onClick={handleSubmit}
                  disabled={isLoading || isDataLoading}
                >
                  {isLoading ? (
                    <div className="flex items-center">
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                      Tilføjer...
                    </div>
                  ) : isDataLoading ? (
                    <div className="flex items-center">
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                      Indlæser...
                    </div>
                  ) : (
                    <div className="flex items-center">
                      <Check className="mr-2 h-5 w-5" />
                      Tilføj Flyvning
                    </div>
                  )}
                </Button>
              </div>
            </DrawerFooter>
          </DrawerContent>
        </Drawer>
      ) : (
        <Dialog open={open} onOpenChange={onOpenChange}>
          <DialogTrigger asChild>
            <Button size="lg" className="h-16 w-full text-lg font-medium rounded-xl shadow-md">
              <Plus className="mr-3 h-7 w-7" /> 
              <Plane className="mr-2 h-6 w-6" />
              Tilføj Flyvning
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px] pt-4">
            <div className="grid gap-4 py-2">
              {error && (
                <div className="text-sm text-red-500 p-2 bg-red-50 rounded border border-red-200">
                  {error}
                </div>
              )}

              <div className="grid gap-1">
                <Label htmlFor="aircraft" className="text-sm font-medium">
                  Fly
                  {selectedAircraft?.isGuest && (
                    <span className="ml-2 inline-flex items-center px-2 py-1 bg-amber-100 text-amber-800 text-xs font-medium rounded-full border border-amber-200">
                      🌍 Gæstefly
                    </span>
                  )}
                  {selectedAircraft && !selectedAircraft.hasFlarm && (
                    <span className="ml-2 inline-flex items-center px-2 py-1 bg-red-100 text-red-800 text-xs font-medium rounded-full border border-red-200">
                      <Image 
                        src="/images/no-flarm-logo.png" 
                        alt="No FLARM" 
                        width={16} 
                        height={16} 
                        className="mr-1"
                      />
                      Ingen FLARM
                    </span>
                  )}
                  {selectedAircraft && selectedAircraft.hasFlarm && (
                    <span className="ml-2 inline-flex items-center px-2 py-1 bg-green-100 text-green-800 text-xs font-medium rounded-full border border-green-200">
                      <Image 
                        src="/images/flarm-logo.png" 
                        alt="FLARM" 
                        width={16} 
                        height={16} 
                        className="mr-1"
                      />
                      FLARM
                    </span>
                  )}
                </Label>
                <div ref={aircraftComboboxRef} className="relative z-[9999]">
                  <Combobox
                    items={aircraftOptions.map((aircraft) => ({
                      label: formatAircraftLabel(aircraft),
                        value: aircraft.id.toString(),
                    }))}
                    value={newFlight.aircraftId}
                    onChange={handleAircraftChange}
                    onTextChange={(text) => {
                      setNewFlight({ ...newFlight, customAircraft: text });
                    }}
                    placeholder="Vælg eller indtast flyregistrering"
                    initialSearchMode={true}
                    tallDropdown={true}
                    searchInOgnDatabase={(inputValue: string) => {
                      // Only search OGN if the input is at least 2 chars
                      if (!inputValue || inputValue.length < 2) return false;
                      
                      // Check if we have any local matches first
                      const normalizedInput = inputValue.toLowerCase();
                      const hasLocalMatches = aircraftOptions.some(aircraft => {
                        // Check registration
                        if (aircraft.registration && 
                            aircraft.registration.toLowerCase().includes(normalizedInput)) {
                          return true;
                        }
                        
                        // Check competition ID
                        if (aircraft.competitionId && 
                            aircraft.competitionId.toLowerCase().includes(normalizedInput)) {
                          return true;
                        }
                        
                        // Check type
                        if (aircraft.type && 
                            aircraft.type.toLowerCase().includes(normalizedInput)) {
                          return true;
                        }
                        
                        return false;
                      });
                      
                      // Only search OGN if we don't have local matches
                      return !hasLocalMatches;
                    }}
                  />
                </div>
              </div>
              <div className="grid gap-1">
                <Label htmlFor="pilot" className="text-sm font-medium">
                  Pilot
                </Label>
                <div className="flex gap-2">
                  <div className="flex-1" ref={pilotComboboxRef}>
                    <Combobox
                      items={pilotOptions.map((pilot) => ({
                        label: pilot.name,
                        value: pilot.id.toString(),
                      }))}
                      value={newFlight.pilotId}
                      onChange={handlePilotChange}
                      onTextChange={(text) => setNewFlight({ ...newFlight, customPilot: text })}
                      placeholder="Vælg klub-pilot eller indtast gæst navn"
                      initialSearchMode={true}
                      tallDropdown={true}
                      customButtonText='Tilføj "{value}" som gæstepilot'
                    />
                  </div>
                  {(newFlight.pilotId || newFlight.customPilot) && (
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
              {selectedAircraft?.isDoubleSeater && (
                <div className="grid gap-1">
                  <Label className="text-sm font-medium">
                    Bagsæde Pilot / Instruktør
                  </Label>
                  <div className="flex gap-2">
                    <div className="flex-1" ref={coPilotComboboxRef}>
                      <Combobox
                        items={pilotOptions.map((pilot) => ({
                          label: pilot.name,
                          value: pilot.id.toString(),
                        }))}
                        value={newFlight.coPilotId}
                        onChange={handleCoPilotChange}
                        onTextChange={(text) => setNewFlight({ ...newFlight, customCoPilot: text })}
                        placeholder="Vælg klub-pilot eller indtast gæst navn"
                        initialSearchMode={true}
                        tallDropdown={true}
                        customButtonText='Tilføj "{value}" som gæstepilot'
                      />
                    </div>
                    {(newFlight.coPilotId || newFlight.customCoPilot) && (
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
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1">
                  <Label htmlFor="startField" className="text-sm font-medium">
                    Startplads
                  </Label>
                  <Select
                    value={newFlight.startField}
                    onValueChange={(value) => setNewFlight({ ...newFlight, startField: value })}
                  >
                    <SelectTrigger className="h-10 text-sm">
                      <SelectValue placeholder="Vælg startplads" />
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
                  <Label htmlFor="launchMethod" className="text-sm font-medium">
                    Startmetode
                  </Label>
                  <Select
                    value={newFlight.launchMethod}
                    onValueChange={(value) => setNewFlight({ ...newFlight, launchMethod: value as LaunchMethod })}
                  >
                    <SelectTrigger className="h-10 text-sm">
                      <SelectValue placeholder="Vælg startmetode" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="S">Spilstart (S)</SelectItem>
                      <SelectItem value="M">Selvstart (M)</SelectItem>
                      <SelectItem value="F">Flyslæb (F)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div 
                className="flex items-center space-x-3 p-4 bg-slate-50 rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-100 transition-colors"
                onClick={() => setNewFlight({ ...newFlight, isSchoolFlight: !newFlight.isSchoolFlight })}
              >
                <Checkbox
                  checked={newFlight.isSchoolFlight}
                  onCheckedChange={(checked) => setNewFlight({ ...newFlight, isSchoolFlight: checked as boolean })}
                  className="h-6 w-6"
                />
                <div className="flex items-center gap-2">
                  <GraduationCap className="h-5 w-5 text-slate-600" />
                  <Label className="text-base font-medium cursor-pointer">
                    Skoleflyning
                  </Label>
                </div>
              </div>
              
              {/* Private Plane Checkbox */}
              <div 
                className="flex items-center space-x-3 p-4 bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg border border-blue-200 cursor-pointer hover:from-blue-100 hover:to-purple-100 transition-colors"
                onClick={() => setIsPrivatePlane(!isPrivatePlane)}
              >
                <Checkbox
                  checked={isPrivatePlane}
                  onCheckedChange={(checked) => setIsPrivatePlane(checked as boolean)}
                  className="h-6 w-6"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <RotateCcw className="h-5 w-5 text-blue-600" />
                    <Label className="text-base font-medium cursor-pointer">
                      Automatisk pilot-tildeling
                    </Label>
                  </div>
                  <div className="text-sm text-blue-600 mt-1">
                    Nye flyvninger i dette fly vil automatisk få tildelt disse piloter i dag
                  </div>
                </div>
              </div>
            </div>
            <DialogFooter className="pt-4">
              <div className="flex w-full justify-between gap-4">
                <Button 
                  variant="outline" 
                  size="lg" 
                  className="h-14 px-6 text-lg font-medium flex-1 border-2 hover:bg-gray-50" 
                  onClick={() => onOpenChange(false)}
                >
                  <X className="mr-2 h-5 w-5" />
                  Annuller
                </Button>
                <Button 
                  size="lg" 
                  className="h-14 px-6 text-lg font-medium flex-1" 
                  onClick={handleSubmit}
                  disabled={isLoading || isDataLoading}
                >
                  {isLoading ? (
                    <div className="flex items-center">
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                      Tilføjer...
                    </div>
                  ) : isDataLoading ? (
                    <div className="flex items-center">
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                      Indlæser...
                    </div>
                  ) : (
                    <div className="flex items-center">
                      <Check className="mr-2 h-5 w-5" />
                      Tilføj Flyvning
                    </div>
                  )}
                </Button>
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  )
}