"use client"

import React from "react"
import { useEffect, useRef, useState, useCallback, useMemo } from "react"
import { Plane, ZoomInIcon, PanelRightIcon, Timer } from "lucide-react"
import type { LiveAircraft } from "@/types/live-map"
import { MapContainer, TileLayer, Marker, Popup, useMap, ZoomControl, Polyline, Polygon } from "react-leaflet"
import L from "leaflet"
import "leaflet/dist/leaflet.css"
import "@/styles/map.css"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useAircraft } from "@/contexts/aircraft-context"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { useIsMobile } from "@/hooks/use-mobile"

// Fix for Leaflet marker icons in Next.js
const setLeafletIcons = () => {
  if (typeof window === 'undefined') return

  delete (L.Icon.Default.prototype as any)._getIconUrl
  
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png",
    iconUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png",
    shadowUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png",
  })
}

// Define flight track data interface
interface FlightTrackPoint {
  id: string;
  aircraft_id: string;
  latitude: number;
  longitude: number;
  altitude: number | null;
  track: number | null;
  ground_speed: number | null;
  climb_rate: number | null;
  turn_rate: number | null;
  timestamp: string;
  mongodb_timestamp: string;
}

interface FlightTrackData {
  success: boolean;
  count: number;
  stats: {
    minAltitude: number;
    maxAltitude: number;
    maxSpeed: number;
    flightDuration: number;
    startTime: string;
    endTime: string;
  };
  data: FlightTrackPoint[];
}

// Create a color scale function for altitude visualization
const getAltitudeColor = (altitude: number | null): string => {
  if (altitude === null) return '#888888';
  
  // Define altitude color ranges (in meters)
  // Colors from low to high: blue -> green -> yellow -> orange -> red
  const altitudeInMeters = altitude; // Already in meters
  
  if (altitudeInMeters < 100) return '#0047AB'; // Dark blue for very low
  if (altitudeInMeters < 200) return '#1E90FF'; // Medium blue
  if (altitudeInMeters < 300) return '#00CC00'; // Green
  if (altitudeInMeters < 400) return '#FFFF00'; // Yellow
  if (altitudeInMeters < 500) return '#FFA500'; // Orange
  return '#FF0000'; // Red for high altitude
};

// Helper function to sort flight track data chronologically
const sortFlightTrackData = (data: any[]) => {
  return [...data].sort((a, b) => {
    return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
  });
};

// Custom Aircraft marker component that rotates according to heading
interface AircraftMarkerProps {
  aircraft: LiveAircraft
  isSelected: boolean
  visibleCallsigns: { [key: string | number]: boolean }
  onPopupOpenChange: (aircraftId: string | number, isOpen: boolean) => void
  storeMarkerRef: (aircraftId: string | number, marker: L.Marker | null) => void
  isClubPlane: boolean
  isInFlight: boolean
  mapType: 'standard' | 'satellite'
}

const AircraftMarker = ({ 
  aircraft, 
  isSelected,
  visibleCallsigns,
  onPopupOpenChange,
  storeMarkerRef,
  isClubPlane,
  isInFlight,
  mapType
}: AircraftMarkerProps) => {
  const { setSelectedAircraft, toggleSidebar, showInSidebar } = useAircraft()
  const map = useMap()
  const markerRef = useRef<L.Marker | null>(null);
  
  // Check if this is a glider - make sure to check for null/undefined safely
  const isGlider = aircraft.aircraftType === "Glider";
  // Check if this is a powered aircraft type or unknown
  const isPoweredAircraft = ["Tow Plane", "Drop Plane", "Powered Aircraft"].includes(aircraft.aircraftType || "");
  const isUnknownType = !aircraft.aircraftType || aircraft.aircraftType === "Unknown" || aircraft.aircraftType === "";
  
  // Get aircraft color based on satellite mode
  const getAircraftColor = () => {
    if (isSelected) return '#2563eb'; // Always blue when selected
    if (mapType === 'satellite') return '#ffffff'; // White in satellite mode
    if (isClubPlane && isInFlight) return '#2563eb';
    if (isClubPlane) return '#93c5fd';
    if (isInFlight) return '#000000';
    return '#6b7280';
  };
  
  // CSS filter for images in satellite mode
  const getImageFilter = () => {
    if (isSelected) {
      return 'filter: brightness(0) saturate(100%) invert(39%) sepia(90%) saturate(2079%) hue-rotate(208deg) brightness(95%) contrast(90%);';
    }
    if (mapType === 'satellite') {
      return 'filter: brightness(0) saturate(100%) invert(100%);'; // Make white in satellite mode
    }
    return isClubPlane ? '' : '';
  };

  // Create a custom plane icon for this aircraft - restructured for better centering
  const planeIcon = L.divIcon({
    className: 'custom-plane-icon',
    html: `
      <div class="marker-container aircraft-marker">
        <div class="plane-icon centered-icon" style="transform: rotate(${aircraft.track !== undefined ? aircraft.track : aircraft.heading}deg);">
          ${isGlider ? 
            // For gliders, use image with appropriate filter
            `<img src="/images/aircrafts/glider.png" width="24" height="24" alt="Glider" 
                 class="${isSelected ? 'selected-aircraft-image' : isClubPlane ? 'club-aircraft' : ''}" 
                 style="${getImageFilter()}" />` : 
            isPoweredAircraft || isUnknownType ?
            // For powered/unknown aircraft, use image with appropriate filter
            `<img src="/images/aircrafts/singleprop.png" width="24" height="24" alt="Powered Aircraft" 
                 class="${isSelected ? 'selected-aircraft-image' : isClubPlane ? 'club-aircraft' : ''}" 
                 style="${getImageFilter()}" />` :
            // Default SVG icon with dynamic color
            `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="${getAircraftColor()}" stroke="none">
              <path d="M21,16V14L13,9V3.5A1.5,1.5 0 0,0 11.5,2A1.5,1.5 0 0,0 10,3.5V9L2,14V16L10,13.5V19L8,20.5V22L11.5,21L15,22V20.5L13,19V13.5L21,16Z" />
            </svg>`
          }
        </div>
        ${visibleCallsigns[aircraft.id] ? `<div class="callsign-box aircraft-callsign ${isClubPlane ? 'bg-primary/10 border-primary' : ''}">${aircraft.registration || aircraft.id}</div>` : ''}
      </div>`,
    iconSize: [40, 40],
    iconAnchor: [20, 20], // Center anchor point to ensure icon is positioned exactly on coordinates
  })
  
  // Store references to the marker when it's created
  useEffect(() => {
    if (markerRef.current) {
      storeMarkerRef(aircraft.id, markerRef.current);
    }
    
    // Cleanup when component unmounts
    return () => {
      storeMarkerRef(aircraft.id, null);
    };
  }, [aircraft.id, storeMarkerRef]);

  // Function to handle aircraft selection
  const handleAircraftSelect = () => {
    setSelectedAircraft(aircraft);
    
    // If sidebar is not visible, show it
    if (!showInSidebar) {
      toggleSidebar();
    }
  };

  return (
    <Marker 
      position={[aircraft.latitude, aircraft.longitude]}
      icon={planeIcon}
      eventHandlers={{
        click: (e) => {
          // Stop event propagation to prevent the map from receiving the click
          L.DomEvent.stopPropagation(e.originalEvent);
          handleAircraftSelect();
        }
      }}
      ref={(marker) => {
        markerRef.current = marker;
        if (marker) storeMarkerRef(aircraft.id, marker);
      }}
    />
  )
}

// Component to get a reference to the map
interface MapEventsProps {
  onMapReady: (map: L.Map) => void;
}

function MapEvents({ onMapReady }: MapEventsProps) {
  const map = useMap();
  
  // Access to the map instance on component mount
  useEffect(() => {
    onMapReady(map);
  }, [map, onMapReady]);
  
  return null;
}

// Component to fit the map to all aircraft - SIMPLIFIED
interface FitBoundsProps {
  mapRef: React.RefObject<L.Map | null>;
}

function FitBounds({ mapRef }: FitBoundsProps) {
  const { aircraft, showAllPlanes, showOnlyFlying, showAdsb, setShowAdsb, isClubPlane, isFlying } = useAircraft()
  const map = useMap();
  const hasInitiallyFit = useRef(false);
  const prevShowAllPlanes = useRef(showAllPlanes);
  
  // Get the currently visible aircraft based on filters
  const visibleAircraft = useMemo(() => {
    return aircraft
      .filter(ac => showAllPlanes || isClubPlane(ac.registration))
      .filter(ac => !showOnlyFlying || isFlying(ac));
  }, [aircraft, showAllPlanes, showOnlyFlying, isClubPlane, isFlying]);
  
  const fitToVisibleAircraft = useCallback(() => {
    if (!map) return;
    
    // Always include EKFS coordinates
    const ekfsCoords = [55.248489, 10.213280];
    
    // If no club planes visible and we're not showing all planes, zoom to airfield
    if (visibleAircraft.length === 0 && !showAllPlanes) {
      map.setView(ekfsCoords as L.LatLngExpression, 13, {
        animate: true,
        duration: 1.5
      });
      return;
    }
    
    if (visibleAircraft.length === 0) {
      // If no aircraft visible but showing all planes, just center on EKFS with medium zoom
      map.setView(ekfsCoords as L.LatLngExpression, 12, {
        animate: true,
        duration: 1.5
      });
      return;
    }
    
    // Create coordinates list with EKFS and visible aircraft
    const coordinates = [
      ekfsCoords,
      ...visibleAircraft.map(ac => [ac.latitude, ac.longitude])
    ];
    
    // Create bounds object
    const bounds = L.latLngBounds(coordinates as L.LatLngExpression[]);
    
    // Determine zoom settings based on what's visible
    const isShowingOnlyClubPlanes = !showAllPlanes;
    const padding: [number, number] = isShowingOnlyClubPlanes ? [30, 30] : [50, 50];
    const maxZoom = isShowingOnlyClubPlanes ? 15 : 13;
    
    // Fit bounds with appropriate settings
    map.fitBounds(bounds, {
      padding: padding,
      maxZoom: maxZoom,
      animate: true,
      duration: 1.0,
    });
  }, [map, visibleAircraft, showAllPlanes]);
  
  // Update the ref with the fit bounds function
  useEffect(() => {
    if (mapRef.current) {
      (mapRef.current as any).fitToAllAircraft = fitToVisibleAircraft;
    }
  }, [fitToVisibleAircraft, mapRef]);
  
  // Fit when filters change or when transitioning to no visible aircraft
  useEffect(() => {
    if (!hasInitiallyFit.current && aircraft.length > 0) {
      fitToVisibleAircraft();
      hasInitiallyFit.current = true;
    } else if (hasInitiallyFit.current && visibleAircraft.length === 0 && !showAllPlanes) {
      // Zoom back to airfield when no club planes visible
      fitToVisibleAircraft();
    } else if (hasInitiallyFit.current && !prevShowAllPlanes.current && showAllPlanes) {
      // Zoom to fit all planes when "Vis alle fly" is toggled on
      fitToVisibleAircraft();
    }
    
    // Update previous showAllPlanes state
    prevShowAllPlanes.current = showAllPlanes;
  }, [fitToVisibleAircraft, visibleAircraft.length, showAllPlanes, aircraft.length]);
  
  return null;
}

// Component to handle map click to deselect aircraft
interface MapClickHandlerProps {
  onMapClick: () => void;
}

function MapClickHandler({ onMapClick }: MapClickHandlerProps) {
  const map = useMap();
  
  useEffect(() => {
    const handleMapClick = (e: L.LeafletMouseEvent) => {
      // Check if click is on the map background and not on a marker
      const container = map.getContainer();
      const target = e.originalEvent.target as HTMLElement;
      
      // Check if the click is on the map itself and not on a marker or another element
      if (target === container || 
          target.classList.contains('leaflet-container') || 
          target.classList.contains('leaflet-pane') ||
          target.classList.contains('leaflet-tile') ||
          target.parentElement?.classList.contains('leaflet-tile-container')) {
        onMapClick();
      }
    };
    
    // Add click event listener
    map.on('click', handleMapClick);
    
    // Cleanup
    return () => {
      map.off('click', handleMapClick);
    };
  }, [map, onMapClick]);
  
  return null;
}

// Function to calculate map center based on average of all aircraft positions
function calculateMapCenter(aircraft: LiveAircraft[]): [number, number] {
  // Default center for EKFS
  const defaultCenter: [number, number] = [55.248489, 10.213280];
  
  if (aircraft.length === 0) return defaultCenter;
  
  const sumLat = aircraft.reduce((sum, ac) => sum + ac.latitude, 0);
  const sumLng = aircraft.reduce((sum, ac) => sum + ac.longitude, 0);
  
  return [sumLat / aircraft.length, sumLng / aircraft.length];
}

// Component to track user zoom interactions
interface UserZoomTrackerProps {
  onUserZoomChange: (isUserZoomed: boolean) => void;
}

function UserZoomTracker({ onUserZoomChange }: UserZoomTrackerProps) {
  const map = useMap();
  
  useEffect(() => {
    let userHasInteracted = false;
    
    // Track manual zoom/pan events
    const handleZoomStart = () => {
      userHasInteracted = true;
      onUserZoomChange(true);
    };
    
    const handleDragStart = () => {
      userHasInteracted = true;
      onUserZoomChange(true);
    };
    
    const handleZoomEnd = () => {
      // Keep track that user has manually zoomed
      onUserZoomChange(true);
    };
    
    const handleDragEnd = () => {
      // Keep track that user has manually panned
      onUserZoomChange(true);
    };
    
    // Listen for zoom and drag events
    map.on('zoomstart', handleZoomStart);
    map.on('zoomend', handleZoomEnd);
    map.on('dragstart', handleDragStart);
    map.on('dragend', handleDragEnd);
    
    // Initial state
    onUserZoomChange(false);
    
    return () => {
      map.off('zoomstart', handleZoomStart);
      map.off('zoomend', handleZoomEnd);
      map.off('dragstart', handleDragStart);
      map.off('dragend', handleDragEnd);
    };
  }, [map, onUserZoomChange]);
  
  return null;
}

// Create Runway and Landing Area components
function RunwaysAndLandingAreas() {
  // Define runway coordinates - use useMemo to prevent recalculation
  const runways = useMemo(() => [
    // EKFS runways: More precise coordinates for Funen/Fyn (Beldringe/Hans Christian Andersen Airport)
    { id: 'runway27', name: '27', lat: 55.247907, lng: 10.208252 },
    { id: 'runway09', name: '09', lat: 55.247904, lng: 10.192738 }
  ], []);

  // Add useEffect to initially center and zoom map on EKFS
  const map = useMap();
  
  useEffect(() => {
    // Set initial view to EKFS with less zoom
    map.setView([55.248489, 10.213280], 12, {
      animate: true
    });
  }, [map]);

  // Function to calculate landing area coordinates
  // Parameters:
  // - runway: the runway object
  // - direction: 'left' or 'right' determining which side of the runway
  // - width: width of the landing area in km
  // - height: height of the landing area in km
  const calculateLandingArea = useCallback((
    runway: { id: string; name: string; lat: number; lng: number },
    direction: 'left' | 'right'
  ) => {
    const width = 2; // 2 km width
    const height = 1.5; // Increase from 0.4 to 0.8 km (800m) height
    
    // Calculate landing area rectangle corners
    // For runway 27, 'right' means east (higher longitude)
    // For runway 09, 'left' means west (lower longitude)
    let longitudeOffset;
    
    if (direction === 'right') {
      longitudeOffset = width / 111.32 / Math.cos(runway.lat * (Math.PI / 180));
    } else {
      longitudeOffset = -width / 111.32 / Math.cos(runway.lat * (Math.PI / 180));
    }
    
    const latitudeOffset = height / 111.32 / 2; // Half the height for top/bottom
    
    // Calculate rectangle corners
    return [
      [runway.lat + latitudeOffset, runway.lng],  // Top center
      [runway.lat + latitudeOffset, runway.lng + longitudeOffset],  // Top right/left
      [runway.lat - latitudeOffset, runway.lng + longitudeOffset],  // Bottom right/left
      [runway.lat - latitudeOffset, runway.lng],  // Bottom center
      [runway.lat + latitudeOffset, runway.lng]   // Back to top center to close the polygon
    ] as L.LatLngExpression[];
  }, []);
  
  // Pre-calculate all landing areas to prevent recalculation during zooming/panning
  const landingAreas = useMemo(() => {
    return runways.map(runway => ({
      runway,
      positions: calculateLandingArea(runway, runway.name === '27' ? 'right' : 'left')
    }));
  }, [runways, calculateLandingArea]);
  
  return (
    <>
      {runways.map(runway => (
        <React.Fragment key={runway.id}>
          {/* Runway marker */}
          <Marker 
            position={[runway.lat, runway.lng]}
            icon={L.divIcon({
              className: 'runway-marker',
              html: `<div class="flex items-center justify-center bg-slate-800 text-white rounded-full" style="width:14px; height:14px; font-size:8px; font-weight:bold;">${runway.name}</div>`,
              iconSize: [14, 14],
              iconAnchor: [7, 7]
            })}
          >
            <Popup>
              <div className="text-xs font-semibold">Runway {runway.name}</div>
            </Popup>
          </Marker>
        </React.Fragment>
      ))}
      
      {/* Render landing areas separately to improve stability */}
      {landingAreas.map(({ runway, positions }) => (
        <Polygon 
          key={`landing-area-${runway.id}`}
          positions={positions}
          pathOptions={{
            color: '#ff0000',
            weight: 1,
            fillColor: '#ff0000',
            fillOpacity: 0.15,
            dashArray: '3,3'
          }}
        >
          <Popup>
            <div className="text-xs font-semibold">Landing Area - Runway {runway.name}</div>
          </Popup>
        </Polygon>
      ))}
    </>
  );
}

// Component to keep the selected aircraft centered on the map
interface FollowSelectedAircraftProps {
  shouldFollow: boolean;
}

function FollowSelectedAircraft({ shouldFollow }: FollowSelectedAircraftProps) {
  const { selectedAircraft } = useAircraft();
  const map = useMap();

  useEffect(() => {
    if (shouldFollow && selectedAircraft && map) {
      map.panTo([selectedAircraft.latitude, selectedAircraft.longitude], {
        animate: true,
        duration: 0.3, // Smooth pan like in statistics map
      });
    }
  }, [map, selectedAircraft, shouldFollow]);

  return null;
}

// Component to track user interactions and disable following on drag only
interface MapInteractionTrackerProps {
  onUserInteraction: (isInteracting: boolean) => void;
}

function MapInteractionTracker({ onUserInteraction }: MapInteractionTrackerProps) {
  // REMOVED - No more interaction tracking needed
  return null;
}

// Map interaction events - like in statistics map
function MapInteractionEvents({ onDragStart }: { onDragStart: () => void }) {
  const map = useMap();
  
  useEffect(() => {
    // Only disable follow on drag events, not on zoom (like statistics map)
    map.on("dragstart", onDragStart);
    
    return () => {
      map.off("dragstart", onDragStart);
    };
  }, [map, onDragStart]);
  
  return null;
}

interface MapPlaceholderProps {
  isLoading: boolean
}

function MapPlaceholder({ isLoading }: MapPlaceholderProps) {
  const { 
    aircraft, 
    selectedAircraft, 
    setSelectedAircraft, 
    showInSidebar,
    toggleSidebar,
    fetchAircraftTrack,
    flightTrack,
    isLoadingTrack,
    showAllPlanes,
    setShowAllPlanes,
    showOnlyFlying,
    setShowOnlyFlying,
    showAdsb,
    setShowAdsb,
    clubPlanes,
    isClubPlane,
    isFlying
  } = useAircraft()
  const isMobile = useIsMobile()
  const hasSetIcons = useRef(false)
  const [visibleCallsigns, setVisibleCallsigns] = useState<{[key: string | number]: boolean}>({})
  const [refreshTime, setRefreshTime] = useState(Date.now());
  const markerRefs = useRef<{[key: string | number]: L.Marker | null}>({});
  const mapRef = useRef<L.Map | null>(null);
  const [isFollowing, setIsFollowing] = useState(false); // Following state like statistics map
  const [mapType, setMapType] = useState<'standard' | 'satellite'>(() => {
    // Initialize from localStorage if available, otherwise default to 'standard'
    if (typeof window !== 'undefined') {
      const savedMapType = localStorage.getItem('livemap-maptype')
      if (savedMapType === 'satellite' || savedMapType === 'standard') {
        return savedMapType
      }
    }
    return 'standard'
  })
  
  // Save mapType to localStorage when it changes
  useEffect(() => {
    localStorage.setItem('livemap-maptype', mapType)
  }, [mapType])
  
  // Set Leaflet icons once
  useEffect(() => {
    if (!hasSetIcons.current) {
      setLeafletIcons()
      hasSetIcons.current = true
    }
  }, [])

  // Initialize all callsigns as visible
  useEffect(() => {
    const initialCallsigns: {[key: string | number]: boolean} = {}
    aircraft.forEach(ac => {
      initialCallsigns[ac.id] = true
    })
    setVisibleCallsigns(initialCallsigns)
  }, [aircraft])

  // Effect for updating the refresh timer every second to update time calculations
  useEffect(() => {
    const interval = setInterval(() => {
      setRefreshTime(Date.now());
    }, 1000);
    
    return () => clearInterval(interval);
  }, []);
  
  // Aircraft selection - zoom to aircraft and start following
  useEffect(() => {
    if (selectedAircraft && selectedAircraft.id && mapRef.current) {
      // Fetch track data for this aircraft
      fetchAircraftTrack(String(selectedAircraft.id));
      
      // Ensure the sidebar is visible when an aircraft is selected
      if (!showInSidebar) {
        toggleSidebar();
      }

      // Zoom to aircraft and enable following
      mapRef.current.flyTo(
        [selectedAircraft.latitude, selectedAircraft.longitude],
        15, // Zoom level
        { animate: true, duration: 1.0 }
      );
      
      // Enable following after zoom completes
      setTimeout(() => setIsFollowing(true), 1000);
    } else {
      // Disable following when no aircraft selected
      setIsFollowing(false);
      
      // Zoom out to show all aircraft when deselecting (especially useful on mobile)
      if (mapRef.current && typeof (mapRef.current as any).fitToAllAircraft === 'function') {
        setTimeout(() => {
          (mapRef.current as any).fitToAllAircraft();
        }, 100); // Reduced delay for smoother transition
      }
    }
  }, [selectedAircraft?.id]); // Only trigger on aircraft ID change
  
  // Map interaction events to disable following on drag
  const handleMapInteraction = useCallback(() => {
    setIsFollowing(false);
  }, []);
  
  // Handle deselection when clicking on the map
  const handleMapClick = useCallback(() => {
    setSelectedAircraft(null);
    setIsFollowing(false);
    
    // Close any open popups
    if (mapRef.current) {
      mapRef.current.closePopup();
    }
  }, [setSelectedAircraft]);

  const handlePopupOpenChange = (aircraftId: string | number, isVisible: boolean) => {
    setVisibleCallsigns(prev => ({
      ...prev,
      [aircraftId]: isVisible
    }))
  }
  
  // Store a reference to the marker
  const storeMarkerRef = useCallback((aircraftId: string | number, marker: L.Marker | null) => {
    markerRefs.current[aircraftId] = marker;
  }, []);
  
  // When a map instance is created, store the reference
  const handleMapReady = useCallback((map: L.Map) => {
    mapRef.current = map;
  }, []);

  // Function to fit the map to show all aircraft
  const fitToAllAircraft = useCallback(() => {
    if (mapRef.current && typeof (mapRef.current as any).fitToAllAircraft === 'function') {
      (mapRef.current as any).fitToAllAircraft();
      setIsFollowing(false); // Disable following when fitting to all
    }
  }, []);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center w-full h-full">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
        <p className="mt-4 text-lg">Indlæser kort...</p>
      </div>
    )
  }

  return (
    <div className="w-full h-full relative">
      {/* Stats Card - Responsive positioning to avoid overlap */}
      <div className="absolute top-6 left-4 z-[1001] hidden lg:block">
        <div className="bg-white rounded-md shadow-md border p-2 text-sm">
          <div className="flex items-center gap-2">
            <Plane className="h-4 w-4 text-primary" />
            <span>{aircraft.length} fly spores</span>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <ZoomInIcon className="h-4 w-4 text-green-600" />
            <span>{aircraft.filter(isFlying).length} fly i luften</span>
          </div>
        </div>
      </div>

      {/* Stats Card for tablet - positioned below controls */}
      <div className="absolute top-20 left-4 z-[1001] hidden md:block lg:hidden">
        <div className="bg-white rounded-md shadow-md border p-2 text-sm">
          <div className="flex items-center gap-2">
            <Plane className="h-4 w-4 text-primary" />
            <span>{aircraft.length} fly spores</span>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <ZoomInIcon className="h-4 w-4 text-green-600" />
            <span>{aircraft.filter(isFlying).length} fly i luften</span>
          </div>
        </div>
      </div>

      {/* Map control buttons - responsive layout */}
      <div className="absolute top-6 right-4 z-[1000] flex gap-2">
        {/* Mobile layout - vertical stack */}
        <div className="md:hidden flex flex-col gap-2">
          <div className="flex items-center gap-2 bg-white p-2 rounded-lg shadow-md border">
            <Switch
              id="show-all-planes-mobile"
              checked={showAllPlanes}
              onCheckedChange={setShowAllPlanes}
              className="data-[state=checked]:bg-primary"
            />
            <Label htmlFor="show-all-planes-mobile" className="text-sm font-medium cursor-pointer">
              Alle fly
            </Label>
          </div>
          
          <div className="flex items-center gap-2 bg-white p-2 rounded-lg shadow-md border">
            <Switch
              id="show-only-flying-mobile"
              checked={showOnlyFlying}
              onCheckedChange={setShowOnlyFlying}
              className="data-[state=checked]:bg-primary"
            />
            <Label htmlFor="show-only-flying-mobile" className="text-sm font-medium cursor-pointer">
              Kun i luften
            </Label>
          </div>
          
          <div className="flex items-center gap-2 bg-white p-2 rounded-lg shadow-md border">
            <Switch
              id="show-adsb-mobile"
              checked={showAdsb}
              onCheckedChange={setShowAdsb}
              className="data-[state=checked]:bg-primary"
            />
            <Label htmlFor="show-adsb-mobile" className="text-sm font-medium cursor-pointer">
              ADSB
            </Label>
          </div>
          
          <div className="flex items-center gap-2 bg-white p-2 rounded-lg shadow-md border">
            <Switch
              id="satellite-view-mobile"
              checked={mapType === 'satellite'}
              onCheckedChange={(checked) => setMapType(checked ? 'satellite' : 'standard')}
              className="data-[state=checked]:bg-primary"
            />
            <Label htmlFor="satellite-view-mobile" className="text-sm font-medium cursor-pointer">
              Satellit
            </Label>
          </div>
        </div>

        {/* Tablet layout - compact horizontal */}
        <div className="hidden md:flex lg:hidden gap-1">
          <div className="flex items-center gap-2 bg-white p-2 rounded-lg shadow-md border">
            <div className="flex items-center gap-2">
              <Switch
                id="show-all-planes-tablet"
                checked={showAllPlanes}
                onCheckedChange={setShowAllPlanes}
                className="data-[state=checked]:bg-primary scale-90"
              />
              <Label htmlFor="show-all-planes-tablet" className="text-sm font-medium cursor-pointer">
                Alle fly
              </Label>
            </div>
            
            <div className="flex items-center gap-2">
              <Switch
                id="show-only-flying-tablet"
                checked={showOnlyFlying}
                onCheckedChange={setShowOnlyFlying}
                className="data-[state=checked]:bg-primary scale-90"
              />
              <Label htmlFor="show-only-flying-tablet" className="text-sm font-medium cursor-pointer">
                I luften
              </Label>
            </div>
            
            <div className="flex items-center gap-2">
              <Switch
                id="show-adsb-tablet"
                checked={showAdsb}
                onCheckedChange={setShowAdsb}
                className="data-[state=checked]:bg-primary scale-90"
              />
              <Label htmlFor="show-adsb-tablet" className="text-sm font-medium cursor-pointer">
                ADSB
              </Label>
            </div>
          </div>
          
          <div className="bg-white p-2 rounded-lg shadow-md border">
            <div className="flex items-center gap-2">
              <Switch
                id="satellite-view-tablet"
                checked={mapType === 'satellite'}
                onCheckedChange={(checked) => setMapType(checked ? 'satellite' : 'standard')}
                className="data-[state=checked]:bg-primary scale-90"
              />
              <Label htmlFor="satellite-view-tablet" className="text-sm font-medium cursor-pointer">
                Satellit
              </Label>
            </div>
          </div>
        </div>

        {/* Desktop layout - full horizontal */}
        <div className="hidden lg:flex gap-2">
          <div className="flex items-center gap-3 bg-white p-3 rounded-lg shadow-md border">
            <div className="flex items-center gap-3 mr-3">
              <Switch
                id="show-all-planes-map"
                checked={showAllPlanes}
                onCheckedChange={setShowAllPlanes}
                className="data-[state=checked]:bg-primary scale-125"
              />
              <Label htmlFor="show-all-planes-map" className="text-lg font-medium cursor-pointer whitespace-nowrap">
                Alle fly
              </Label>
            </div>
            
            <div className="flex items-center gap-3 mr-3">
              <Switch
                id="show-only-flying"
                checked={showOnlyFlying}
                onCheckedChange={setShowOnlyFlying}
                className="data-[state=checked]:bg-primary scale-125"
              />
              <Label htmlFor="show-only-flying" className="text-lg font-medium cursor-pointer whitespace-nowrap">
                Kun fly i luften
              </Label>
            </div>
            
            <div className="flex items-center gap-3">
              <Switch
                id="show-adsb"
                checked={showAdsb}
                onCheckedChange={setShowAdsb}
                className="data-[state=checked]:bg-primary scale-125"
              />
              <Label htmlFor="show-adsb" className="text-lg font-medium cursor-pointer whitespace-nowrap">
                ADSB
              </Label>
            </div>
          </div>
          
          <div className="bg-white p-3 rounded-lg shadow-md border">
            <div className="flex items-center gap-3">
              <Switch
                id="satellite-view"
                checked={mapType === 'satellite'}
                onCheckedChange={(checked) => setMapType(checked ? 'satellite' : 'standard')}
                className="data-[state=checked]:bg-primary scale-125"
              />
              <Label htmlFor="satellite-view" className="text-lg font-medium cursor-pointer whitespace-nowrap">
                Satellit
              </Label>
            </div>
          </div>
        </div>
      </div>

      {/* Track loading indicator */}
      {isLoadingTrack && (
        <div className="absolute bottom-4 left-4 z-[1001]">
          <div className="bg-white rounded-lg shadow-md p-2 flex items-center gap-2">
            <Skeleton className="h-5 w-5 rounded-full animate-pulse bg-primary/30" />
            <span className="text-sm text-gray-700">Indlæser flyrute...</span>
          </div>
        </div>
      )}

      <MapContainer 
        center={calculateMapCenter(aircraft)} 
        zoom={aircraft.length ? 12 : 12} // Medium zoom level whether aircraft present or not
        style={{ height: "100%", width: "100%" }}
        zoomControl={false}
      >
        <MapEvents onMapReady={handleMapReady} />
        <MapClickHandler onMapClick={handleMapClick} />
        <MapInteractionEvents onDragStart={handleMapInteraction} />
        {!isMobile && <ZoomControl position="bottomright" />}
        <TileLayer
          attribution={mapType === 'satellite' 
            ? '&copy; <a href="https://www.esri.com/">Esri</a> &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
            : '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          }
          url={mapType === 'satellite' 
            ? "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            : "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          }
        />
        
        {/* Add runways and landing areas */}
        <RunwaysAndLandingAreas />
        
        {/* Show aircraft markers with updated color logic */}
        {aircraft
          .filter(ac => showAllPlanes || isClubPlane(ac.registration))
          .filter(ac => !showOnlyFlying || isFlying(ac))
          .map((ac) => (
            <AircraftMarker 
              key={ac.id}
              aircraft={ac}
              isSelected={selectedAircraft?.id === ac.id}
              visibleCallsigns={visibleCallsigns}
              onPopupOpenChange={handlePopupOpenChange}
              storeMarkerRef={storeMarkerRef}
              isClubPlane={isClubPlane(ac.registration)}
              isInFlight={isFlying(ac)}
              mapType={mapType}
            />
          ))}
        
        {/* Add following component */}
        <FollowSelectedAircraft shouldFollow={isFollowing} />
        
        <FitBounds mapRef={mapRef} />
      </MapContainer>
    </div>
  )
}

// Update the export to be named export for dynamic import compatibility
export { MapPlaceholder }

