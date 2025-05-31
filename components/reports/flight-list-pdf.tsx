""

import React from 'react';
import { 
  Document, 
  Page, 
  Text, 
  View, 
  StyleSheet, 
  Font 
} from '@react-pdf/renderer';

// Define interfaces for types
interface FlightData {
  number: number;
  registration: string;
  type: string;
  pilot1: string;
  pilot2: string;
  isSchoolFlight: boolean;
  takeoffTime: string;
  landingTime: string;
  flightTime: string;
  launchMethod: string;
}

interface AircraftStat {
  registration: string;
  flightCount: number;
  flightTime: string;
}

interface FlightListPdfProps {
  date: string;
  flights: FlightData[];
  totalFlights: number;
  totalFlightTime?: string;
  aircraftStats: AircraftStat[];
}

// Define styles
const styles = StyleSheet.create({
  page: {
    flexDirection: 'column',
    backgroundColor: '#ffffff',
    padding: 30
  },
  header: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 5,
    textAlign: 'center',
  },
  subheader: {
    fontSize: 12,
    marginBottom: 20,
    textAlign: 'center',
  },
  tableHeader: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#000',
    borderBottomStyle: 'solid',
    backgroundColor: '#f0f0f0',
    fontWeight: 'bold',
    padding: 8,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
    borderBottomStyle: 'solid',
    padding: 8,
    minHeight: 24,
  },
  tableRowSchool: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
    borderBottomStyle: 'solid',
    padding: 8,
    minHeight: 24,
    backgroundColor: '#f8f9fa',
  },
  tableCell: {
    flex: 1,
    fontSize: 10,
  },
  tableCellNarrow: {
    flex: 0.7,
    fontSize: 10,
  },
  tableCellWide: {
    flex: 1.5,
    fontSize: 10,
  },
  footer: {
    position: 'absolute',
    bottom: 30,
    left: 30,
    right: 30,
    fontSize: 8,
    textAlign: 'center',
    color: 'grey',
  },
  summaryContainer: {
    marginTop: 20,
    padding: 10,
    backgroundColor: '#f8f8f8',
    borderRadius: 5,
  },
  summaryTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  summaryRow: {
    flexDirection: 'row',
    marginBottom: 5,
  },
  summaryLabel: {
    fontSize: 10,
    flex: 1,
  },
  summaryValue: {
    fontSize: 10,
    fontWeight: 'bold',
    flex: 1,
  },
  aircraftStatsTable: {
    marginTop: 10,
  },
  aircraftStatsRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
    borderBottomStyle: 'solid',
    padding: 5,
  },
  aircraftStatsHeader: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#000',
    borderBottomStyle: 'solid',
    padding: 5,
    backgroundColor: '#f0f0f0',
    fontWeight: 'bold',
  },
  aircraftStatsCell: {
    flex: 1,
    fontSize: 10,
  },
  noFlightsText: {
    fontSize: 14,
    textAlign: 'center',
    marginTop: 30,
    fontStyle: 'italic',
  }
});

// Create the PDF document
export const createFlightListPdf = ({ date, flights, totalFlights, totalFlightTime, aircraftStats }: FlightListPdfProps) => (
  <Document>
    <Page size="A4" style={styles.page}>
      <Text style={styles.header}>Flyveklubben FSK - Startliste</Text>
      <Text style={styles.subheader}>{date}</Text>

      {flights.length > 0 ? (
        <>
          {/* Table header */}
          <View style={styles.tableHeader}>
            <Text style={styles.tableCellNarrow}>#</Text>
            <Text style={styles.tableCell}>Registrering</Text>
            <Text style={styles.tableCell}>Type</Text>
            <Text style={styles.tableCellWide}>Pilot</Text>
            <Text style={styles.tableCellWide}>Co-pilot</Text>
            <Text style={styles.tableCellNarrow}>Metode</Text>
            <Text style={styles.tableCellNarrow}>Start</Text>
            <Text style={styles.tableCellNarrow}>Landing</Text>
            <Text style={styles.tableCellNarrow}>Tid</Text>
          </View>

          {/* Table content */}
          {flights.map((flight) => (
            <View key={flight.number} style={flight.isSchoolFlight ? styles.tableRowSchool : styles.tableRow}>
              <Text style={styles.tableCellNarrow}>{flight.number}</Text>
              <Text style={styles.tableCell}>{flight.registration}</Text>
              <Text style={styles.tableCell}>{flight.type}</Text>
              <Text style={styles.tableCellWide}>{flight.pilot1}</Text>
              <Text style={styles.tableCellWide}>{flight.pilot2}</Text>
              <Text style={styles.tableCellNarrow}>{flight.launchMethod}</Text>
              <Text style={styles.tableCellNarrow}>{flight.takeoffTime}</Text>
              <Text style={styles.tableCellNarrow}>{flight.landingTime}</Text>
              <Text style={styles.tableCellNarrow}>{flight.flightTime}</Text>
            </View>
          ))}

          {/* Summary section */}
          <View style={styles.summaryContainer}>
            <Text style={styles.summaryTitle}>Samlet Statistik</Text>
            
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Antal flyvninger:</Text>
              <Text style={styles.summaryValue}>{totalFlights}</Text>
            </View>
            
            {/* Aircraft statistics */}
            {aircraftStats.length > 0 && (
              <View style={styles.aircraftStatsTable}>
                <Text style={[styles.summaryTitle, { marginTop: 10, fontSize: 12 }]}>Pr. Fly</Text>
                
                <View style={styles.aircraftStatsHeader}>
                  <Text style={styles.aircraftStatsCell}>Registrering</Text>
                  <Text style={styles.aircraftStatsCell}>Antal starter</Text>
                  <Text style={styles.aircraftStatsCell}>Flyvetid</Text>
                </View>
                
                {aircraftStats.map((stat, index) => (
                  <View key={index} style={styles.aircraftStatsRow}>
                    <Text style={styles.aircraftStatsCell}>{stat.registration}</Text>
                    <Text style={styles.aircraftStatsCell}>{stat.flightCount}</Text>
                    <Text style={styles.aircraftStatsCell}>{stat.flightTime}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        </>
      ) : (
        <Text style={styles.noFlightsText}>Ingen flyvninger registreret for denne dag</Text>
      )}

      <Text style={styles.footer}>
        Genereret {new Date().toLocaleString('da-DK')} - Flyveklubben FSK
      </Text>
    </Page>
  </Document>
); 