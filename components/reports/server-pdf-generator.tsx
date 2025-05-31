import { 
  Document, 
  Page, 
  Text, 
  View, 
  StyleSheet 
} from '@react-pdf/renderer';
import { getCurrentTimezoneOffset } from '@/lib/time-utils';

// Function to format date as DD.MM.YYYY HH:MM with proper CET/CEST timezone
const formatDate = (date: Date): string => {
  // Apply the Danish timezone offset to the date
  const offsetHours = getCurrentTimezoneOffset();
  const localDate = new Date(date.getTime() + offsetHours * 60 * 60 * 1000);
  
  const day = localDate.getUTCDate().toString().padStart(2, '0');
  const month = (localDate.getUTCMonth() + 1).toString().padStart(2, '0');
  const year = localDate.getUTCFullYear();
  const hours = localDate.getUTCHours().toString().padStart(2, '0');
  const minutes = localDate.getUTCMinutes().toString().padStart(2, '0');
  
  return `${day}.${month}.${year} ${hours}:${minutes}`;
};

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
  takeoffAirfield?: string;
  landingAirfield?: string;
  feltDisplay?: string;
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
  trafficLeader?: string;
  towPerson?: string;
  clubName?: string;
}

// Define styles
const styles = StyleSheet.create({
  page: {
    flexDirection: 'column',
    backgroundColor: '#ffffff',
    padding: 30,
    fontFamily: 'Helvetica',
  },
  header: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 5,
    textAlign: 'center',
  },
  subheader: {
    fontSize: 12,
    marginBottom: 4,
    textAlign: 'center',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 20,
    fontSize: 10,
  },
  infoItem: {
    marginHorizontal: 8,
    fontSize: 10,
    flexWrap: 'wrap',
  },
  tableHeader: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#000',
    borderBottomStyle: 'solid',
    backgroundColor: '#f0f0f0',
    fontWeight: 'bold',
    padding: 6,
  },
  tableHeaderCell: {
    fontSize: 9,
    textAlign: 'center',
    fontWeight: 'bold',
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
    borderBottomStyle: 'solid',
    padding: 6,
    minHeight: 24,
  },
  tableRowSchool: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
    borderBottomStyle: 'solid',
    padding: 6,
    minHeight: 24,
    backgroundColor: '#f8f9fa',
  },
  tableCell: {
    flex: 1,
    fontSize: 9,
    paddingHorizontal: 2,
  },
  tableCellNarrow: {
    flex: 0.4,
    fontSize: 9,
    paddingHorizontal: 2,
  },
  tableCellWide: {
    flex: 1.4,
    fontSize: 9,
    paddingHorizontal: 2,
  },
  tableCellMedium: {
    flex: 0.7,
    fontSize: 9,
    paddingHorizontal: 2,
  },
  tableCellCenter: {
    flex: 0.4,
    fontSize: 9,
    textAlign: 'center',
    paddingHorizontal: 2,
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
  pageNumber: {
    position: 'absolute',
    bottom: 15,
    left: 0,
    right: 0,
    fontSize: 9,
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
    fontSize: 9,
  },
  noFlightsText: {
    fontSize: 14,
    textAlign: 'center',
    marginTop: 30,
    fontStyle: 'italic',
  },
  columnHeader: {
    borderRightWidth: 1,
    borderRightColor: '#ddd',
    borderRightStyle: 'solid',
    paddingHorizontal: 2,
  },
  lastColumnHeader: {
    paddingHorizontal: 2,
  },
  regText: {
    fontSize: 9,
    paddingRight: 4,
  }
});

// Create the PDF document
export const createFlightListPdf = ({ 
  date, 
  flights, 
  totalFlights, 
  totalFlightTime, 
  aircraftStats,
  trafficLeader,
  towPerson,
  clubName
}: FlightListPdfProps) => (
  <Document>
    <Page size="A4" style={styles.page} wrap>
      <Text style={styles.header}>{clubName || 'Startliste'} - Startliste</Text>
      <Text style={styles.subheader}>{date}</Text>
      
      <View style={styles.infoRow}>
        {trafficLeader && (
          <Text style={styles.infoItem}>Trafikleder: {trafficLeader}</Text>
        )}
        {towPerson && (
          <Text style={styles.infoItem}>Spilfører: {towPerson}</Text>
        )}
      </View>

      {flights.length > 0 ? (
        <>
          {/* Table header */}
          <View style={styles.tableHeader}>
            <View style={[styles.tableCellNarrow, styles.columnHeader]}>
              <Text style={styles.tableHeaderCell}>#</Text>
            </View>
            <View style={[styles.tableCellMedium, styles.columnHeader]}>
              <Text style={styles.tableHeaderCell}>Reg</Text>
            </View>
            <View style={[styles.tableCellWide, styles.columnHeader]}>
              <Text style={styles.tableHeaderCell}>Pilot</Text>
            </View>
            <View style={[styles.tableCellWide, styles.columnHeader]}>
              <Text style={styles.tableHeaderCell}>Bagsæde / Instr.</Text>
            </View>
            <View style={[styles.tableCellNarrow, styles.columnHeader]}>
              <Text style={styles.tableHeaderCell}>Metode</Text>
            </View>
            <View style={[styles.tableCellMedium, styles.columnHeader]}>
              <Text style={styles.tableHeaderCell}>Start/Land</Text>
            </View>
            <View style={[styles.tableCellNarrow, styles.columnHeader]}>
              <Text style={styles.tableHeaderCell}>Start</Text>
            </View>
            <View style={[styles.tableCellNarrow, styles.columnHeader]}>
              <Text style={styles.tableHeaderCell}>Slut</Text>
            </View>
            <View style={[styles.tableCellNarrow, styles.lastColumnHeader]}>
              <Text style={styles.tableHeaderCell}>Tid</Text>
            </View>
          </View>

          {/* Table content */}
          {flights.map((flight) => (
            <View key={flight.number} style={flight.isSchoolFlight ? styles.tableRowSchool : styles.tableRow}>
              <Text style={styles.tableCellCenter}>{flight.number}</Text>
              <Text style={styles.tableCellMedium}>
                <Text style={styles.regText}>{flight.registration}</Text>
              </Text>
              <Text style={styles.tableCellWide}>{flight.pilot1}</Text>
              <Text style={styles.tableCellWide}>{flight.pilot2}</Text>
              <Text style={styles.tableCellCenter}>{flight.launchMethod}</Text>
              <Text style={styles.tableCellMedium}>{flight.feltDisplay || flight.takeoffAirfield || 'EKFS'}</Text>
              <Text style={styles.tableCellCenter}>{flight.takeoffTime}</Text>
              <Text style={styles.tableCellCenter}>{flight.landingTime}</Text>
              <Text style={styles.tableCellCenter}>{flight.flightTime}</Text>
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
                  <Text style={styles.aircraftStatsCell}>Reg</Text>
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
        Genereret {formatDate(new Date())} - {clubName || 'Ukendt Klub'}
      </Text>
      
      <Text style={styles.pageNumber} render={({ pageNumber, totalPages }) => (
        `Side ${pageNumber} af ${totalPages}`
      )} fixed />
    </Page>
  </Document>
); 