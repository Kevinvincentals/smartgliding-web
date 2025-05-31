"use client"

import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { MapContainer, TileLayer, Marker, Polyline, useMap, ZoomControl } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "@/styles/map.css"; // Assuming you have some base map styles

import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Play, Pause, FastForward, RotateCcw, X, Loader2, AlertTriangle, MapPin, ArrowUp, WindIcon, Compass, TrendingUp, TrendingDown, Minus, LocateFixedIcon, Users, CalendarDays, Rocket, Download } from "lucide-react";

// Interfaces from the API endpoint
interface FlightTrackPoint {
  id: string;
  aircraft_id: string;
  latitude: number;
  longitude: number;
  altitude: number | null;
  track: number | null;
  ground_speed: number | null; // Knots
  climb_rate: number | null; // m/s
  turn_rate: number | null;
  timestamp: string; // ISO string
}

interface FlightStats {
  minAltitude: number | null;
  maxAltitude: number | null;
  maxSpeed: number | null; // Knots
  flightDuration: number; // minutes
  startTime: string | null;
  endTime: string | null;
}

// New interface for FlightLogbook details (copied from API for consistency)
interface FlightLogbookDetails {
  pilot1Name: string | null;
  pilot2Name: string | null;
  takeoffTime: string | null; 
  landingTime: string | null; 
  launchMethod: string | null;
  registration: string | null;
  planeType: string | null;
  isSchoolFlight: boolean | null;
}

interface FlightTrackDataResponse {
  success: boolean;
  count: number;
  stats: FlightStats;
  data: FlightTrackPoint[];
  flightDetails: FlightLogbookDetails | null; // Ensure this is part of the main response type
  error?: string;
}

// Props for the StatisticsReplayMap component
interface StatisticsReplayMapProps {
  flightLogbookId: string;
  aircraftRegistration: string; // For display purposes
  onClose: () => void;
}

// Fix for Leaflet marker icons in Next.js (copied from map-placeholder)
const setLeafletIcons = () => {
  if (typeof window === 'undefined') return;
  delete (L.Icon.Default.prototype as any)._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png",
    iconUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png",
    shadowUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png",
  });
};

const ReplayMapCore: React.FC<{
  flightData: FlightTrackDataResponse;
  aircraftRegistrationDisplay: string; // Use a different prop name to avoid conflict with flightData.flightDetails.registration
  flightLogbookId: string; // Add flightLogbookId prop
}> = ({ flightData, aircraftRegistrationDisplay, flightLogbookId }) => {
  const mapRef = useRef<L.Map | null>(null);
  const [replayStatus, setReplayStatus] = useState<"paused" | "playing" | "ended">("paused");
  const [currentPointIndex, setCurrentPointIndex] = useState(0);
  const [replaySpeed, setReplaySpeed] = useState(2);
  const replayIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const [isFollowing, setIsFollowing] = useState(true); // State for follow mode

  const trackPoints = useMemo(() => flightData.data || [], [flightData.data]);
  const currentReplayPoint = useMemo(() => trackPoints[currentPointIndex], [trackPoints, currentPointIndex]);
  const { flightDetails } = flightData; // Destructure for easier access

  // Segment flight path for coloring based on climb rate
  const pathSegments = useMemo(() => {
    if (trackPoints.length < 2) return [];

    const segments: Array<{ points: Array<[number, number]>; color: string }> = [];
    let currentSegmentPoints: Array<[number, number]> = [[trackPoints[0].latitude, trackPoints[0].longitude]];
    let lastStatus = "level"; // "climbing", "descending", "level"

    const getStatus = (climbRate: number | null): string => {
      if (climbRate === null || climbRate === undefined) return "level";
      if (climbRate > 0.25) return "climbing"; // Threshold for climbing
      if (climbRate < -0.25) return "descending"; // Threshold for descending
      return "level";
    };

    for (let i = 1; i < trackPoints.length; i++) {
      const point = trackPoints[i];
      const prevPoint = trackPoints[i-1];
      const currentStatus = getStatus(prevPoint.climb_rate); // Color segment based on prev point's climb rate

      if (currentStatus !== lastStatus && currentSegmentPoints.length > 0) {
        // Add the start of the new segment before pushing the old one
        currentSegmentPoints.push([point.latitude, point.longitude]);
        segments.push({
          points: [...currentSegmentPoints],
          color: lastStatus === "climbing" ? "#22c55e" : lastStatus === "descending" ? "#ef4444" : "#3b82f6", // Green, Red, Blue
        });
        currentSegmentPoints = [[prevPoint.latitude, prevPoint.longitude], [point.latitude, point.longitude]]; // Start new segment with the connecting point
      } else {
        currentSegmentPoints.push([point.latitude, point.longitude]);
      }
      lastStatus = currentStatus;
    }

    // Push the last segment
    if (currentSegmentPoints.length > 1) {
      segments.push({
        points: currentSegmentPoints,
        color: lastStatus === "climbing" ? "#22c55e" : lastStatus === "descending" ? "#ef4444" : "#3b82f6",
      });
    }
    return segments;
  }, [trackPoints]);

  // Fit map to flight path on initial load or when track points change
  useEffect(() => {
    if (mapRef.current && trackPoints.length > 0) {
      const bounds = L.latLngBounds(trackPoints.map(p => [p.latitude, p.longitude]));
      mapRef.current.fitBounds(bounds, { padding: [50, 50] });
      setIsFollowing(true); // Reset to follow after fitting bounds
    }
  }, [trackPoints]); // Only depends on trackPoints for initial fit

  // Effect for following the aircraft
  useEffect(() => {
    if (isFollowing && currentReplayPoint && mapRef.current) {
      mapRef.current.panTo([currentReplayPoint.latitude, currentReplayPoint.longitude], {
        animate: true,
        duration: 0.3, // Smooth pan
      });
    }
  }, [currentReplayPoint, isFollowing]);

  // Event handler for map interactions (to disable follow)
  const MapInteractionEvents = () => {
    const map = useMap();
    useEffect(() => {
      const disableFollow = () => setIsFollowing(false);
      
      // Only disable follow on drag events, not on zoom
      map.on("dragstart", disableFollow);
      
      // Remove the zoomstart event listener that disables follow
      // map.on("zoomstart", disableFollow);
      
      return () => {
        map.off("dragstart", disableFollow);
        // Also remove this from cleanup
        // map.off("zoomstart", disableFollow);
      };
    }, [map]);
    return null;
  };

  // Update interval when replay speed changes while playing
  useEffect(() => {
    if (replayStatus === "playing" && trackPoints.length > 0) {
      // Clear existing interval and create a new one with updated speed
      if (replayIntervalRef.current) clearInterval(replayIntervalRef.current);
      
      replayIntervalRef.current = setInterval(() => {
        setCurrentPointIndex(prevIndex => {
          const nextIndex = prevIndex + 1;
          if (nextIndex >= trackPoints.length) {
            if (replayIntervalRef.current) clearInterval(replayIntervalRef.current);
            setReplayStatus("ended");
            return prevIndex;
          }
          return nextIndex;
        });
      }, 1000 / replaySpeed); // Apply the new speed
      
      // Cleanup on unmount or speed/status change
      return () => {
        if (replayIntervalRef.current) clearInterval(replayIntervalRef.current);
      };
    }
  }, [replaySpeed, replayStatus, trackPoints.length]);

  const startReplay = useCallback(() => {
    if (replayStatus === "playing" || trackPoints.length === 0) return;
    setReplayStatus("playing");
    // The interval will be created by the effect above when replayStatus changes
  }, [replayStatus, trackPoints.length]);

  const pauseReplay = useCallback(() => {
    setReplayStatus("paused");
    // The effect will clear the interval when replayStatus changes
  }, []);

  const resetReplay = useCallback(() => {
    setCurrentPointIndex(0);
    setReplayStatus("paused");
    // The effect will clear the interval when replayStatus changes
  }, []);

  const handleSeek = useCallback((progress: number) => { // progress is 0-100
    if (trackPoints.length === 0) return;
    const newIndex = Math.floor((progress / 100) * (trackPoints.length - 1));
    setCurrentPointIndex(newIndex);
    // No need to manipulate intervals here anymore
    // The useEffect will handle starting/stopping the interval based on replayStatus
  }, [trackPoints.length]);
  
  const replayProgress = trackPoints.length > 0 ? (currentPointIndex / (trackPoints.length - 1)) * 100 : 0;

  // Custom aircraft icon for replay
  const replayAircraftIcon = useMemo(() => L.divIcon({
    className: 'custom-plane-icon',
    html: `
      <div class="marker-container replay-marker" style="transform: rotate(${currentReplayPoint?.track || 0}deg);">
        <img src="/images/aircrafts/glider.png" style="width: 40px; height: 40px;" alt="Glider Icon" />
      </div>`,
    iconSize: [40, 40],
    iconAnchor: [20, 20], // Half of the iconSize for centering
  }), [currentReplayPoint?.track]);

  // Add function to handle IGC download
  const handleDownloadIGC = useCallback(() => {
    window.open(`/api/tablet/flight-download-igc?flight_logbook_id=${flightLogbookId}`, '_blank');
  }, [flightLogbookId]);

  if (trackPoints.length === 0) {
    return <div className="p-4 text-center">Ingen rute data for denne flyvning.</div>;
  }

  return (
    <div className="h-[85vh] w-full flex flex-col">
      <MapContainer 
        ref={map => { if (map) mapRef.current = map; }}
        center={trackPoints.length > 0 ? [trackPoints[0].latitude, trackPoints[0].longitude] : [55.5, 10.5]} // Default center if no points
        zoom={trackPoints.length > 0 ? 13 : 7} 
        style={{ flexGrow: 1, height: "100%", width: "100%" }} 
        zoomControl={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <ZoomControl position="bottomright" />
        <MapInteractionEvents />
        {pathSegments.map((segment, index) => (
          <Polyline 
            key={index}
            positions={segment.points as L.LatLngExpression[]}
            pathOptions={{ color: segment.color, weight: 4, opacity: 0.8 }}
          />
        ))}
        {currentReplayPoint && (
          <Marker 
            position={[currentReplayPoint.latitude, currentReplayPoint.longitude]} 
            icon={replayAircraftIcon}
          >
            {/* Optionally, add a popup with current data */}
          </Marker>
        )}
      </MapContainer>
      <div className="p-4 border-t bg-background space-y-3">
        <div className="flex items-center justify-between">
            <div>
                <h3 className="font-semibold text-xl">{flightDetails?.registration || aircraftRegistrationDisplay}</h3>
                {flightDetails?.planeType && <p className="text-xs text-muted-foreground">{flightDetails.planeType}</p>}
            </div>
            <div className="flex gap-2">
                <Button 
                    variant="outline" 
                    size="sm"
                    onClick={handleDownloadIGC}
                    className="gap-1.5 h-9"
                    title="Download som IGC fil"
                >
                    <Download className="h-4 w-4" />
                    Download IGC
                </Button>
                <Button 
                    variant={isFollowing ? "secondary" : "outline"} 
                    size="sm"
                    onClick={() => setIsFollowing(!isFollowing)}
                    className="gap-1.5 h-9"
                    title={isFollowing ? "Stop med at følge flyet" : "Følg flyet"}
                >
                    <LocateFixedIcon className={`h-4 w-4 ${isFollowing ? 'text-primary' : ''}`} />
                    {isFollowing ? "Følger" : "Følg"}
                </Button>
            </div>
        </div>

        {/* Flight Details Section */}
        {flightDetails && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-2 text-sm border-b pb-3 mb-2">
            <div className="flex items-center gap-1.5">
              <Users className="h-4 w-4 text-muted-foreground" />
              <span>{flightDetails.pilot1Name || "N/A"}
                {flightDetails.pilot2Name && ` / ${flightDetails.pilot2Name}`}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <CalendarDays className="h-4 w-4 text-muted-foreground" />
              <span>
                {flightDetails.takeoffTime ? new Date(flightDetails.takeoffTime).toLocaleDateString('da-DK', { month: 'short', day: 'numeric'}) : ''}
                {' '}
                {flightDetails.takeoffTime ? new Date(flightDetails.takeoffTime).toLocaleTimeString('da-DK', { hour: '2-digit', minute: '2-digit' }) : "N/A"}
                {flightDetails.landingTime && ` - ${new Date(flightDetails.landingTime).toLocaleTimeString('da-DK', { hour: '2-digit', minute: '2-digit' })}`}
              </span>
            </div>
             {flightDetails.isSchoolFlight && (
              <div className="flex items-center gap-1.5 text-blue-600 font-medium">
                <TrendingUp className="h-4 w-4" /> {/* Placeholder for a school icon if available */}
                <span>Skoleflyvning</span>
              </div>
            )}
          </div>
        )}

        <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
                {currentReplayPoint ? new Date(currentReplayPoint.timestamp).toLocaleTimeString('da-DK') : '--:--:--'} / {flightData.stats.endTime ? new Date(flightData.stats.endTime).toLocaleTimeString('da-DK') : '--:--:--'}
            </div>
        </div>
        <Slider
            value={[replayProgress]}
            min={0}
            max={100}
            step={0.1}
            onValueChange={(value) => handleSeek(value[0])}
            className="my-3"
        />
        <div className="flex items-center justify-center gap-3 mt-3">
          <Button variant="ghost" size="lg" onClick={resetReplay} title="Genstart" className="p-3 h-16 w-16">
            <RotateCcw className="h-8 w-8" />
          </Button>
          {replayStatus === "playing" ? (
            <Button variant="outline" size="lg" onClick={pauseReplay} title="Pause" className="p-3 h-16 w-16">
              <Pause className="h-8 w-8" />
            </Button>
          ) : (
            <Button variant="outline" size="lg" onClick={startReplay} title="Afspil" disabled={replayStatus === 'ended'} className="p-3 h-16 w-16">
              <Play className="h-8 w-8" />
            </Button>
          )}
          <div className="flex items-center gap-2 ml-2">
            {[1, 2, 4, 8, 12].map((speed: number) => (
              <Button 
                key={speed} 
                variant={replaySpeed === speed ? "secondary" : "ghost"} 
                size="lg"
                onClick={() => setReplaySpeed(speed)}
                className="px-4 py-2 h-14 text-lg"
              >
                {speed}x
              </Button>
            ))}
          </div>
        </div>
        {currentReplayPoint && (
            <div className="grid grid-cols-4 gap-x-2 gap-y-2 mt-2 text-center">
                <div className="flex flex-col items-center">
                    <ArrowUp className="h-5 w-5 mb-0.5 text-blue-500" />
                    <span className="text-base font-semibold">{currentReplayPoint.altitude?.toFixed(0) ?? 'N/A'} m</span>
                    <span className="text-xs text-muted-foreground">Højde</span>
                </div>
                <div className="flex flex-col items-center">
                    <WindIcon className="h-5 w-5 mb-0.5 text-green-500" />
                    <span className="text-base font-semibold">{currentReplayPoint.ground_speed ? (currentReplayPoint.ground_speed * 1.852).toFixed(0) : 'N/A'} km/t</span>
                    <span className="text-xs text-muted-foreground">Ground speed</span>
                </div>
                <div className="flex flex-col items-center">
                    <Compass className="h-5 w-5 mb-0.5 text-purple-500" />
                    <span className="text-base font-semibold">{currentReplayPoint.track?.toFixed(0) ?? 'N/A'}°</span>
                    <span className="text-xs text-muted-foreground">Kurs</span>
                </div>
                <div className="flex flex-col items-center">
                    {currentReplayPoint.climb_rate && currentReplayPoint.climb_rate > 0.2 ? (
                        <TrendingUp className="h-5 w-5 mb-0.5 text-emerald-500" />
                    ) : currentReplayPoint.climb_rate && currentReplayPoint.climb_rate < -0.2 ? (
                        <TrendingDown className="h-5 w-5 mb-0.5 text-red-500" />
                    ) : (
                        <Minus className="h-5 w-5 mb-0.5 text-gray-400" /> 
                    )}
                    <span className="text-base font-semibold">{currentReplayPoint.climb_rate?.toFixed(1) ?? 'N/A'} m/s</span>
                    <span className="text-xs text-muted-foreground">Stig/Fald</span>
                </div>
            </div>
        )}
      </div>
    </div>
  );
};

export function StatisticsReplayMap({ flightLogbookId, aircraftRegistration, onClose }: StatisticsReplayMapProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [flightData, setFlightData] = useState<FlightTrackDataResponse | null>(null);

  useEffect(() => {
    // Moved from top-level to ensure it only runs on the client
    setLeafletIcons();
  }, []); // Empty dependency array: run once on mount

  useEffect(() => {
    if (!flightLogbookId) return;
    setIsLoading(true);
    setError(null);

    fetch(`/api/tablet/flight-replay-data?flight_logbook_id=${flightLogbookId}`)
      .then(res => {
        if (!res.ok) throw new Error(`Server error: ${res.status}`);
        return res.json();
      })
      .then((data: FlightTrackDataResponse) => {
        if (data.success) {
          setFlightData(data);
        } else {
          throw new Error(data.error || "Kunne ikke hente rute data.");
        }
      })
      .catch(err => {
        console.error("Error fetching flight replay data:", err);
        setError(err.message || "En ukendt fejl opstod.");
      })
      .finally(() => setIsLoading(false));
  }, [flightLogbookId]);

  return (
    <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-5xl p-0" onEscapeKeyDown={onClose}>
        <DialogClose asChild className="absolute right-3 top-3 z-50">
          <Button variant="ghost" size="icon" aria-label="Luk">
            <X className="h-5 w-5" />
          </Button>
        </DialogClose>

        {isLoading && (
          <div className="h-[75vh] flex flex-col items-center justify-center">
            <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
            <p className="text-lg">Indlæser flyrute...</p>
          </div>
        )}
        {error && (
          <div className="h-[75vh] flex flex-col items-center justify-center p-8 text-center">
            <AlertTriangle className="h-12 w-12 text-destructive mb-4" />
            <p className="text-lg font-semibold text-destructive">Fejl ved indlæsning af data</p>
            <p className="text-sm text-muted-foreground mt-1">{error}</p>
            <Button onClick={onClose} variant="outline" className="mt-6">Luk</Button>
          </div>
        )}
        {!isLoading && !error && flightData && (
          <ReplayMapCore 
            flightData={flightData} 
            aircraftRegistrationDisplay={aircraftRegistration} 
            flightLogbookId={flightLogbookId}
          />
        )}
         {!isLoading && !error && !flightData && (
            <div className="h-[75vh] flex flex-col items-center justify-center">
                <MapPin className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-lg">Ingen data fundet for denne flyvning.</p>
                <Button onClick={onClose} variant="outline" className="mt-6">Luk</Button>
            </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
