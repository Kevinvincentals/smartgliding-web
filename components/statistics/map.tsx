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
  altitude: number | null; // MSL altitude in meters
  altitude_agl: number | null; // AGL altitude in meters
  track: number | null;
  ground_speed: number | null; // Knots
  climb_rate: number | null; // m/s
  turn_rate: number | null;
  timestamp: string; // ISO string
}

interface FlightStats {
  minAltitude: number | null; // MSL
  maxAltitude: number | null; // MSL
  minAltitudeAgl: number | null; // AGL
  maxAltitudeAgl: number | null; // AGL
  airfieldElevation: number | null; // MSL in meters
  winchLaunchTop: number | null; // Altitude at winch launch top (MSL)
  winchLaunchTopIndex: number | null; // Index in trackPoints where winch launch top occurs
  isWinchFlight: boolean; // Whether this flight was detected as winch launch
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

// Altitude Profile Component
const AltitudeProfile: React.FC<{
  trackPoints: FlightTrackPoint[];
  currentIndex: number;
  onSeek: (index: number) => void;
  flightStats: FlightStats;
}> = ({ trackPoints, currentIndex, onSeek, flightStats }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [panOffset, setPanOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [lastMouseX, setLastMouseX] = useState(0);

  // Auto-pan to keep current position visible when zoomed
  useEffect(() => {
    if (zoomLevel > 1 && trackPoints.length > 0 && currentIndex >= 0) {
      const totalPoints = trackPoints.length;
      const visiblePointCount = Math.ceil(totalPoints / zoomLevel);
      const startIndex = Math.floor(panOffset * (totalPoints - visiblePointCount));
      const endIndex = startIndex + visiblePointCount;

      // If current position is outside visible range, auto-pan to center it
      if (currentIndex < startIndex || currentIndex > endIndex) {
        const targetStartIndex = Math.max(0, currentIndex - Math.floor(visiblePointCount / 2));
        const maxStartIndex = totalPoints - visiblePointCount;
        const clampedStartIndex = Math.min(targetStartIndex, maxStartIndex);
        const newPanOffset = clampedStartIndex / (totalPoints - visiblePointCount);
        setPanOffset(Math.max(0, Math.min(1, newPanOffset)));
      }
    }
  }, [currentIndex, zoomLevel, trackPoints.length, panOffset]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || trackPoints.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = rect.height * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

    // Clear canvas
    ctx.clearRect(0, 0, rect.width, rect.height);

    // Calculate visible range based on zoom and pan
    const totalPoints = trackPoints.length;
    const visiblePointCount = Math.ceil(totalPoints / zoomLevel);
    const startIndex = Math.floor(panOffset * (totalPoints - visiblePointCount));
    const endIndex = Math.min(startIndex + visiblePointCount, totalPoints - 1);
    const visiblePoints = trackPoints.slice(startIndex, endIndex + 1);

    if (visiblePoints.length === 0) return;

    // Find altitude range for visible points - prefer AGL if available, otherwise use MSL
    const visibleAltitudes = visiblePoints.map(p => p.altitude_agl !== null ? p.altitude_agl : (p.altitude || 0)).filter(a => a !== null);
    const minAlt = Math.min(...visibleAltitudes);
    const maxAlt = Math.max(...visibleAltitudes);
    const altRange = maxAlt - minAlt || 100;
    const padding = 15;
    const useAgl = visiblePoints.some(p => p.altitude_agl !== null);

    // Draw altitude scale labels with AGL/MSL indicator
    ctx.fillStyle = '#666';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'left';

    const altLabel = useAgl ? 'AGL' : 'MSL';
    // Draw min and max altitude labels
    ctx.fillText(`${maxAlt.toFixed(0)}m ${altLabel}`, 5, 20);
    ctx.fillText(`${minAlt.toFixed(0)}m ${altLabel}`, 5, rect.height - 10);

    // Draw middle altitude if range is significant
    if (altRange > 200) {
      const midAlt = (minAlt + maxAlt) / 2;
      ctx.fillText(`${midAlt.toFixed(0)}m ${altLabel}`, 5, rect.height / 2 + 5);
    }

    // Draw altitude profile with gradient fill
    const gradient = ctx.createLinearGradient(0, 0, 0, rect.height);
    gradient.addColorStop(0, 'rgba(59, 130, 246, 0.4)');
    gradient.addColorStop(1, 'rgba(59, 130, 246, 0.1)');

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.moveTo(padding + 50, rect.height - padding);

    visiblePoints.forEach((point, index) => {
      const x = (index / (visiblePoints.length - 1)) * (rect.width - 2 * padding - 50) + padding + 50;
      const altValue = useAgl && point.altitude_agl !== null ? point.altitude_agl : (point.altitude || 0);
      const y = rect.height - padding - (altValue - minAlt) / altRange * (rect.height - 2 * padding);
      ctx.lineTo(x, y);
    });

    ctx.lineTo(rect.width - padding, rect.height - padding);
    ctx.closePath();
    ctx.fill();

    // Draw altitude line
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 3;
    ctx.beginPath();

    visiblePoints.forEach((point, index) => {
      const x = (index / (visiblePoints.length - 1)) * (rect.width - 2 * padding - 50) + padding + 50;
      const altValue = useAgl && point.altitude_agl !== null ? point.altitude_agl : (point.altitude || 0);
      const y = rect.height - padding - (altValue - minAlt) / altRange * (rect.height - 2 * padding);

      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.stroke();

    // Draw current position (SIMPLE VERSION - ALWAYS show if in visible range)
    if (currentIndex >= 0 && currentIndex < trackPoints.length && currentIndex >= startIndex && currentIndex <= endIndex) {
      const visibleCurrentIndex = currentIndex - startIndex;
      const x = (visibleCurrentIndex / (visiblePoints.length - 1)) * (rect.width - 2 * padding - 50) + padding + 50;
      const currentPoint = trackPoints[currentIndex];
      const currentAltValue = useAgl && currentPoint.altitude_agl !== null ? currentPoint.altitude_agl : (currentPoint.altitude || 0);
      const y = rect.height - padding - (currentAltValue - minAlt) / altRange * (rect.height - 2 * padding);

      // Draw vertical line
      ctx.strokeStyle = 'rgba(239, 68, 68, 0.8)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, padding);
      ctx.lineTo(x, rect.height - padding);
      ctx.stroke();

      // Draw circle at current altitude
      ctx.fillStyle = '#ef4444';
      ctx.strokeStyle = 'white';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x, y, 6, 0, 2 * Math.PI);
      ctx.fill();
      ctx.stroke();

      // ALWAYS show tooltip - check if winch and modify text
      const isWinchPoint = flightStats.winchLaunchTopIndex === currentIndex;
      const altText = isWinchPoint
        ? `${currentAltValue.toFixed(0)}m ${altLabel} (Spilstart højde)`
        : `${currentAltValue.toFixed(0)}m ${altLabel}`;

      console.log('Tooltip Debug:', { currentIndex, winchIndex: flightStats.winchLaunchTopIndex, isWinchPoint, altText, x, y });

      ctx.font = 'bold 14px sans-serif';
      const textWidth = ctx.measureText(altText).width;

      // Position text
      let textX = x + 15;
      let textY = y + 4;

      if (isWinchPoint) {
        // Position to the right like normal tooltips, but with special styling
        textX = x + 15;
        textY = y + 4;
        // Adjust if going off screen
        if (x + textWidth + 30 > rect.width) {
          textX = x - textWidth - 15;
        }
        console.log('Winch tooltip positioning:', { textX, textY, textWidth, originalY: y });
      } else {
        if (x + textWidth + 30 > rect.width) {
          textX = x - textWidth - 15;
        }
      }

      // Draw text background
      ctx.fillStyle = isWinchPoint ? 'rgba(245, 158, 11, 0.9)' : 'rgba(0, 0, 0, 0.8)';
      ctx.fillRect(textX - 4, textY - 16, textWidth + 8, 20);

      // Draw text
      ctx.fillStyle = 'white';
      ctx.fillText(altText, textX, textY);

      console.log('Tooltip rendered:', { altText, textX, textY, fillStyle: ctx.fillStyle });
    }

    // Draw winch launch top marker if applicable (only if it's within the visible range)
    if (flightStats.winchLaunchTopIndex !== null && flightStats.winchLaunchTop !== null) {
      const winchIndex = flightStats.winchLaunchTopIndex;
      if (winchIndex >= 0 && winchIndex < trackPoints.length && winchIndex >= startIndex && winchIndex <= endIndex) {
        const visibleWinchIndex = winchIndex - startIndex;
        const x = (visibleWinchIndex / (visiblePoints.length - 1)) * (rect.width - 2 * padding - 50) + padding + 50;
        const winchAltValue = useAgl && trackPoints[winchIndex].altitude_agl !== null
          ? trackPoints[winchIndex].altitude_agl
          : (trackPoints[winchIndex].altitude || 0);
        const y = rect.height - padding - (winchAltValue - minAlt) / altRange * (rect.height - 2 * padding);

        // Draw subtle winch launch top marker (small circle with dot)
        // Outer circle
        ctx.fillStyle = 'rgba(245, 158, 11, 0.8)'; // Semi-transparent amber
        ctx.strokeStyle = 'rgba(245, 158, 11, 1)'; // Solid amber border
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, 6, 0, 2 * Math.PI);
        ctx.fill();
        ctx.stroke();

        // Inner dot
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(x, y, 2.5, 0, 2 * Math.PI);
        ctx.fill();

        // Small indicator line going up
        ctx.strokeStyle = 'rgba(245, 158, 11, 0.6)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, y - 6);
        ctx.lineTo(x, y - 15);
        ctx.stroke();

        // Don't show separate winch tooltip - it's handled by the current position tooltip
      }
    }
  }, [trackPoints, currentIndex, flightStats, zoomLevel, panOffset]);

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || trackPoints.length === 0) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const padding = 15;
    const progress = (x - padding - 50) / (rect.width - 2 * padding - 50);
    const index = Math.round(progress * (trackPoints.length - 1));

    if (index >= 0 && index < trackPoints.length) {
      onSeek(index);
    }
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const padding = 15;
    const relativeMouseX = (mouseX - padding - 50) / (rect.width - 2 * padding - 50);

    const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
    const newZoomLevel = Math.max(1, Math.min(10, zoomLevel * zoomFactor));

    if (newZoomLevel !== zoomLevel) {
      // Adjust pan to zoom towards mouse position
      const currentViewCenter = panOffset + 0.5 / zoomLevel;
      const mousePosition = panOffset + relativeMouseX / zoomLevel;
      const newPanOffset = mousePosition - 0.5 / newZoomLevel;

      setZoomLevel(newZoomLevel);
      setPanOffset(Math.max(0, Math.min(1 - 1 / newZoomLevel, newPanOffset)));
    }
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    setIsDragging(false);
    setLastMouseX(e.clientX);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.buttons === 1) { // Left mouse button is pressed
      const deltaX = e.clientX - lastMouseX;
      const canvas = canvasRef.current;
      if (!canvas) return;

      if (Math.abs(deltaX) > 2) {
        setIsDragging(true);
      }

      const rect = canvas.getBoundingClientRect();
      const panSensitivity = 1 / (rect.width - 2 * 15 - 50);
      const panDelta = -deltaX * panSensitivity / zoomLevel;

      const newPanOffset = Math.max(0, Math.min(1 - 1 / zoomLevel, panOffset + panDelta));
      setPanOffset(newPanOffset);
      setLastMouseX(e.clientX);
    }
  };

  const handleMouseUp = () => {
    setTimeout(() => setIsDragging(false), 100);
  };

  const resetZoom = () => {
    setZoomLevel(1);
    setPanOffset(0);
  };

  return (
    <div className="relative w-full h-full">
      <canvas
        ref={canvasRef}
        className="w-full h-full cursor-crosshair"
        onClick={(e) => {
          if (isDragging) return;

          const canvas = canvasRef.current;
          if (!canvas || trackPoints.length === 0) return;

          const rect = canvas.getBoundingClientRect();
          const x = e.clientX - rect.left;
          const padding = 15;

          const visibleWidth = rect.width - 2 * padding - 50;
          const totalPoints = trackPoints.length;
          const visiblePointCount = Math.ceil(totalPoints / zoomLevel);
          const startIndex = Math.floor(panOffset * (totalPoints - visiblePointCount));

          const relativeX = (x - padding - 50) / visibleWidth;
          const index = Math.round(startIndex + relativeX * visiblePointCount);

          if (index >= 0 && index < trackPoints.length) {
            onSeek(index);
          }
        }}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        style={{ width: '100%', height: '100%' }}
      />
      {zoomLevel > 1 && (
        <div className="absolute top-2 right-2 flex gap-1">
          <div className="bg-background/90 backdrop-blur-sm rounded px-2 py-1 text-xs font-medium">
            {zoomLevel.toFixed(1)}x
          </div>
          <button
            onClick={resetZoom}
            className="bg-background/90 backdrop-blur-sm hover:bg-background rounded px-2 py-1 text-xs font-medium transition-colors"
          >
            Reset
          </button>
        </div>
      )}
    </div>
  );
};

const ReplayMapCore: React.FC<{
  flightData: FlightTrackDataResponse;
  aircraftRegistrationDisplay: string;
  flightLogbookId: string;
}> = ({ flightData, aircraftRegistrationDisplay, flightLogbookId }) => {
  const mapRef = useRef<L.Map | null>(null);
  const [replayStatus, setReplayStatus] = useState<"paused" | "playing" | "ended">("paused");
  const [currentPointIndex, setCurrentPointIndex] = useState(0);
  const [replaySpeed, setReplaySpeed] = useState(2);
  const replayIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const [isFollowing, setIsFollowing] = useState(true);

  const trackPoints = useMemo(() => flightData.data || [], [flightData.data]);
  const currentReplayPoint = useMemo(() => trackPoints[currentPointIndex], [trackPoints, currentPointIndex]);
  const { flightDetails } = flightData;

  // Segment flight path for coloring based on climb rate
  const pathSegments = useMemo(() => {
    if (trackPoints.length < 2) return [];

    const segments: Array<{ points: Array<[number, number]>; color: string }> = [];
    let currentSegmentPoints: Array<[number, number]> = [[trackPoints[0].latitude, trackPoints[0].longitude]];
    let lastStatus = "level";

    const getStatus = (climbRate: number | null): string => {
      if (climbRate === null || climbRate === undefined) return "level";
      if (climbRate > 0.25) return "climbing";
      if (climbRate < -0.25) return "descending";
      return "level";
    };

    for (let i = 1; i < trackPoints.length; i++) {
      const point = trackPoints[i];
      const prevPoint = trackPoints[i-1];
      const currentStatus = getStatus(prevPoint.climb_rate);

      if (currentStatus !== lastStatus && currentSegmentPoints.length > 0) {
        currentSegmentPoints.push([point.latitude, point.longitude]);
        segments.push({
          points: [...currentSegmentPoints],
          color: lastStatus === "climbing" ? "#22c55e" : lastStatus === "descending" ? "#ef4444" : "#3b82f6",
        });
        currentSegmentPoints = [[prevPoint.latitude, prevPoint.longitude], [point.latitude, point.longitude]];
      } else {
        currentSegmentPoints.push([point.latitude, point.longitude]);
      }
      lastStatus = currentStatus;
    }

    if (currentSegmentPoints.length > 1) {
      segments.push({
        points: currentSegmentPoints,
        color: lastStatus === "climbing" ? "#22c55e" : lastStatus === "descending" ? "#ef4444" : "#3b82f6",
      });
    }
    return segments;
  }, [trackPoints]);

  // Fit map to flight path on initial load
  useEffect(() => {
    if (mapRef.current && trackPoints.length > 0) {
      const bounds = L.latLngBounds(trackPoints.map(p => [p.latitude, p.longitude]));
      mapRef.current.fitBounds(bounds, { padding: [50, 50] });
      setIsFollowing(true);
    }
  }, [trackPoints]);

  // Effect for following the aircraft
  useEffect(() => {
    if (isFollowing && currentReplayPoint && mapRef.current) {
      mapRef.current.panTo([currentReplayPoint.latitude, currentReplayPoint.longitude], {
        animate: true,
        duration: 0.3,
      });
    }
  }, [currentReplayPoint, isFollowing]);

  // Event handler for map interactions
  const MapInteractionEvents = () => {
    const map = useMap();
    useEffect(() => {
      const disableFollow = () => setIsFollowing(false);
      map.on("dragstart", disableFollow);
      return () => {
        map.off("dragstart", disableFollow);
      };
    }, [map]);
    return null;
  };

  // Update interval when replay speed changes while playing
  useEffect(() => {
    if (replayStatus === "playing" && trackPoints.length > 0) {
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
      }, 1000 / replaySpeed);

      return () => {
        if (replayIntervalRef.current) clearInterval(replayIntervalRef.current);
      };
    }
  }, [replaySpeed, replayStatus, trackPoints.length]);

  const startReplay = useCallback(() => {
    if (replayStatus === "playing" || trackPoints.length === 0) return;
    setReplayStatus("playing");
  }, [replayStatus, trackPoints.length]);

  const pauseReplay = useCallback(() => {
    setReplayStatus("paused");
  }, []);

  const resetReplay = useCallback(() => {
    setCurrentPointIndex(0);
    setReplayStatus("paused");
  }, []);

  const handleSeek = useCallback((progress: number) => {
    if (trackPoints.length === 0) return;
    const newIndex = Math.floor((progress / 100) * (trackPoints.length - 1));
    setCurrentPointIndex(newIndex);
  }, [trackPoints.length]);

  const handleSeekToIndex = useCallback((index: number) => {
    if (index >= 0 && index < trackPoints.length) {
      setCurrentPointIndex(index);
    }
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
    iconAnchor: [20, 20],
  }), [currentReplayPoint?.track]);

  const handleDownloadIGC = useCallback(() => {
    window.open(`/api/tablet/flight-download-igc?flight_logbook_id=${flightLogbookId}`, '_blank');
  }, [flightLogbookId]);

  if (trackPoints.length === 0) {
    return <div className="p-4 text-center">Ingen rute data for denne flyvning.</div>;
  }

  return (
    <div className="h-[100vh] w-full grid grid-rows-[auto_1fr_auto_auto] md:flex md:flex-col">
      {/* Header - Compact on mobile */}
      <div className="flex flex-col md:flex-row md:items-center justify-between px-3 md:px-4 py-2 md:py-3 border-b bg-background space-y-1 md:space-y-0">
        <div className="flex flex-col space-y-1 md:space-y-2 min-w-0 flex-1">
          {/* Aircraft Info */}
          <div className="flex items-center gap-2 md:gap-3">
            <span className="font-bold text-lg md:text-xl lg:text-2xl truncate">
              {flightDetails?.registration || aircraftRegistrationDisplay}
            </span>
            {flightDetails?.planeType && (
              <span className="text-sm md:text-lg text-muted-foreground hidden sm:inline">• {flightDetails.planeType}</span>
            )}
          </div>

          {/* Pilot & Time Info - More compact on mobile */}
          {flightDetails && (
            <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 text-sm md:text-base">
              <div className="flex items-center gap-1.5 min-w-0">
                <Users className="h-4 w-4 md:h-5 md:w-5 text-muted-foreground flex-shrink-0" />
                <span className="font-medium truncate">
                  {flightDetails.pilot1Name || "N/A"}
                  {flightDetails.pilot2Name && ` / ${flightDetails.pilot2Name}`}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <CalendarDays className="h-4 w-4 md:h-5 md:w-5 text-muted-foreground flex-shrink-0" />
                <span className="text-muted-foreground text-xs md:text-sm">
                  {flightDetails.takeoffTime && new Date(flightDetails.takeoffTime).toLocaleTimeString('da-DK', { hour: '2-digit', minute: '2-digit' })}
                  {flightDetails.landingTime && ` - ${new Date(flightDetails.landingTime).toLocaleTimeString('da-DK', { hour: '2-digit', minute: '2-digit' })}`}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Actions - Compact on mobile */}
        <div className="flex items-center gap-2 md:gap-3 md:mr-12 lg:mr-16">
          <Button
            variant={isFollowing ? "secondary" : "outline"}
            size={"sm"}
            onClick={() => setIsFollowing(!isFollowing)}
            className="h-9 md:h-12 px-3 md:px-4 text-sm md:text-base"
            title={isFollowing ? "Stop med at følge" : "Følg fly"}
          >
            <LocateFixedIcon className={`h-4 w-4 md:h-5 md:w-5 mr-1 md:mr-2 ${isFollowing ? 'text-primary' : ''}`} />
            <span className="hidden sm:inline">{isFollowing ? "Følger" : "Følg"}</span>
          </Button>
          <Button
            variant="outline"
            size={"sm"}
            onClick={handleDownloadIGC}
            className="h-9 md:h-12 px-3 md:px-4 text-sm md:text-base"
            title="Download IGC fil"
          >
            <Download className="h-4 w-4 md:h-5 md:w-5 mr-1 md:mr-2" />
            <span className="hidden sm:inline">Download IGC</span>
            <span className="sm:hidden">IGC</span>
          </Button>
        </div>
      </div>

      {/* Map Container - Takes remaining space */}
      <div className="relative min-h-0 md:flex-1">
        <MapContainer
          ref={map => { if (map) mapRef.current = map; }}
          center={trackPoints.length > 0 ? [trackPoints[0].latitude, trackPoints[0].longitude] : [55.5, 10.5]}
          zoom={trackPoints.length > 0 ? 13 : 7}
          style={{ height: "100%", width: "100%" }}
          zoomControl={false}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <ZoomControl position="topright" />
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
            />
          )}
        </MapContainer>

        {/* Stats Overlay */}
        {currentReplayPoint && (
          <div className="absolute top-4 left-4 bg-background/95 backdrop-blur-sm rounded-lg p-3 md:p-4 shadow-lg z-[400]">
            <div className="grid grid-cols-2 gap-x-4 md:gap-x-6 gap-y-2 text-sm md:text-base">
              <div className="flex flex-col">
                <div className="flex items-center gap-2">
                  <ArrowUp className="h-4 w-4 md:h-5 md:w-5 text-blue-500" />
                  {currentReplayPoint.altitude_agl !== null ? (
                    <span className="font-bold text-base md:text-lg">{currentReplayPoint.altitude_agl.toFixed(0)}m AGL</span>
                  ) : (
                    <span className="font-bold text-base md:text-lg">{currentReplayPoint.altitude?.toFixed(0) ?? '0'}m MSL</span>
                  )}
                </div>
                {currentReplayPoint.altitude_agl !== null && currentReplayPoint.altitude !== null && (
                  <div className="text-xs md:text-sm text-muted-foreground ml-6 md:ml-7">
                    {currentReplayPoint.altitude.toFixed(0)}m MSL
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                <WindIcon className="h-4 w-4 md:h-5 md:w-5 text-green-500" />
                <span className="font-bold text-base md:text-lg">{currentReplayPoint.ground_speed ? (currentReplayPoint.ground_speed * 1.852).toFixed(0) : '0'}km/t</span>
              </div>
              <div className="flex items-center gap-2">
                <Compass className="h-4 w-4 md:h-5 md:w-5 text-purple-500" />
                <span className="font-bold text-base md:text-lg">{currentReplayPoint.track?.toFixed(0) ?? '0'}°</span>
              </div>
              <div className="flex items-center gap-2">
                {currentReplayPoint.climb_rate && currentReplayPoint.climb_rate > 0.2 ? (
                  <TrendingUp className="h-4 w-4 md:h-5 md:w-5 text-emerald-500" />
                ) : currentReplayPoint.climb_rate && currentReplayPoint.climb_rate < -0.2 ? (
                  <TrendingDown className="h-4 w-4 md:h-5 md:w-5 text-red-500" />
                ) : (
                  <Minus className="h-4 w-4 md:h-5 md:w-5 text-gray-400" />
                )}
                <span className="font-bold text-base md:text-lg">{currentReplayPoint.climb_rate?.toFixed(1) ?? '0.0'}m/s</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Altitude Profile Section */}
      <div className="border-t bg-muted/30">
        <div className="p-2 md:p-3">
          <div className="h-[18vh] md:h-40 lg:h-44 bg-background rounded-lg border">
            <AltitudeProfile
              trackPoints={trackPoints}
              currentIndex={currentPointIndex}
              onSeek={handleSeekToIndex}
              flightStats={flightData.stats}
            />
          </div>
        </div>
      </div>

      {/* Bottom Controls */}
      <div className="border-t bg-background">
        <div className="px-3 md:px-4 py-3 space-y-3">
          {/* Timeline */}
          <div className="flex items-center gap-2 md:gap-3">
            <span className="text-xs md:text-base text-muted-foreground min-w-[45px] md:min-w-[70px] font-mono text-center">
              {currentReplayPoint ? new Date(currentReplayPoint.timestamp).toLocaleTimeString('da-DK', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '--:--:--'}
            </span>
            <Slider
              value={[replayProgress]}
              min={0}
              max={100}
              step={0.1}
              onValueChange={(value) => handleSeek(value[0])}
              className="flex-1"
            />
            <span className="text-xs md:text-base text-muted-foreground min-w-[45px] md:min-w-[70px] text-right font-mono">
              {flightData.stats.endTime ? new Date(flightData.stats.endTime).toLocaleTimeString('da-DK', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '--:--:--'}
            </span>
          </div>

          {/* Playback Controls - Larger on mobile */}
          <div className="flex items-center justify-center gap-3 md:gap-4">
            <Button variant="outline" size="sm" onClick={resetReplay} className="h-12 w-12 md:h-12 md:w-12">
              <RotateCcw className="h-6 w-6 md:h-6 md:w-6" />
            </Button>
            {replayStatus === "playing" ? (
              <Button variant="default" size="sm" onClick={pauseReplay} className="h-14 w-14 md:h-14 md:w-14">
                <Pause className="h-7 w-7 md:h-8 md:w-8" />
              </Button>
            ) : (
              <Button variant="default" size="sm" onClick={startReplay} disabled={replayStatus === 'ended'} className="h-14 w-14 md:h-14 md:w-14">
                <Play className="h-7 w-7 md:h-8 md:w-8" />
              </Button>
            )}
            <div className="flex items-center gap-2 md:gap-2 ml-3 md:ml-4">
              {[1, 2, 4, 8].map((speed: number) => (
                <Button
                  key={speed}
                  variant={replaySpeed === speed ? "secondary" : "outline"}
                  size="sm"
                  onClick={() => setReplaySpeed(speed)}
                  className="h-10 md:h-10 px-3 md:px-4 text-sm md:text-base"
                >
                  {speed}x
                </Button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export function StatisticsReplayMap({ flightLogbookId, aircraftRegistration, onClose }: StatisticsReplayMapProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [flightData, setFlightData] = useState<FlightTrackDataResponse | null>(null);

  useEffect(() => {
    setLeafletIcons();
  }, []);

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
      <DialogContent className="max-w-7xl w-full h-[100vh] md:h-[95vh] md:w-[98vw] lg:w-[95vw] p-0 rounded-none md:rounded-lg overflow-hidden" onEscapeKeyDown={onClose}>
        <DialogClose className="absolute right-4 top-4 z-[500] bg-background/95 backdrop-blur-sm rounded-lg p-1 hover:bg-background shadow-lg border h-10 w-10 flex items-center justify-center">
          <X className="h-6 w-6" />
        </DialogClose>

        {isLoading && (
          <div className="h-[75vh] flex flex-col items-center justify-center">
            <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
            <p className="text-xl">Indlæser flyrute...</p>
          </div>
        )}
        {error && (
          <div className="h-[75vh] flex flex-col items-center justify-center p-8 text-center">
            <AlertTriangle className="h-12 w-12 text-destructive mb-4" />
            <p className="text-xl font-semibold text-destructive">Fejl ved indlæsning af data</p>
            <p className="text-base text-muted-foreground mt-1">{error}</p>
            <Button onClick={onClose} variant="outline" className="mt-6 text-lg px-6 py-3">Luk</Button>
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
                <p className="text-xl">Ingen data fundet for denne flyvning.</p>
                <Button onClick={onClose} variant="outline" className="mt-6 text-lg px-6 py-3">Luk</Button>
            </div>
        )}
      </DialogContent>
    </Dialog>
  );
}