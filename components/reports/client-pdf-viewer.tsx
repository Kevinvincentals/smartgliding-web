"use client"

import React, { useState } from 'react';
import { PDFViewer } from '@react-pdf/renderer';
import { createFlightListPdf } from './server-pdf-generator';
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

interface PDFViewerProps {
  date: string;
  flights: any[]; // Use the FlightData type from server-pdf-generator
  totalFlights: number;
  totalFlightTime: string;
  aircraftStats: any[]; // Use the AircraftStat type from server-pdf-generator
  trafficLeader?: string;
  towPerson?: string;
  isLoading?: boolean;
}

export function ClientPDFViewer({ 
  date, 
  flights, 
  totalFlights, 
  totalFlightTime, 
  aircraftStats,
  trafficLeader,
  towPerson,
  isLoading = false 
}: PDFViewerProps) {
  const [isRendering, setIsRendering] = useState(true);

  // This will render the PDF using the server-side PDF generator
  const pdfDocument = createFlightListPdf({
    date,
    flights,
    totalFlights,
    totalFlightTime,
    aircraftStats,
    trafficLeader,
    towPerson
  });

  // Simulate rendering completion after a short delay
  React.useEffect(() => {
    const timer = setTimeout(() => {
      setIsRendering(false);
    }, 1500);
    
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="w-full h-full min-h-[500px] flex flex-col">
      {isLoading || isRendering ? (
        <div className="flex items-center justify-center w-full h-full min-h-[500px]">
          <Loader2 className="h-8 w-8 animate-spin" />
          <span className="ml-2">Forbereder PDF...</span>
        </div>
      ) : (
        <PDFViewer 
          className="w-full h-full min-h-[500px]" 
          showToolbar={true}
        >
          {pdfDocument}
        </PDFViewer>
      )}
    </div>
  );
} 