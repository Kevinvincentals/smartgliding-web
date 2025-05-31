import fs from 'fs';
import path from 'path';
import { promises as fsPromises } from 'fs';

interface GliderData {
  deviceType: string;
  deviceId: string;
  aircraftModel: string;
  registration: string;
  competitionNumber: string;
  tracked: boolean;
  identified: boolean;
}

/**
 * Downloads the latest glider database and saves it locally
 */
export async function downloadGliderDatabase(): Promise<boolean> {
  try {
    const url = 'https://ddb.glidernet.org/download/';
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Failed to download glider database: ${response.statusText}`);
    }
    
    const data = await response.text();
    
    // Ensure the data directory exists
    const dataDir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    
    // Save the database
    const filePath = path.join(dataDir, 'glider_database.csv');
    await fsPromises.writeFile(filePath, data, 'utf8');
    
    console.log('Glider database downloaded successfully');
    return true;
  } catch (error) {
    console.error('Error downloading glider database:', error);
    return false;
  }
}

/**
 * Parses the CSV data and returns a structured array of glider data
 */
export async function parseGliderDatabase(): Promise<GliderData[]> {
  try {
    const filePath = path.join(process.cwd(), 'data', 'glider_database.csv');
    
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      console.error('Glider database file not found. Downloading...');
      const downloaded = await downloadGliderDatabase();
      if (!downloaded) {
        return [];
      }
    }
    
    // Read and parse the file
    const fileContent = await fsPromises.readFile(filePath, 'utf8');
    const lines = fileContent.split('\n').filter(line => line.trim() !== '');
    
    const gliders: GliderData[] = [];
    
    // Skip the header line if it exists
    const startIndex = lines[0].startsWith('#') ? 1 : 0;
    
    for (let i = startIndex; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Parse the CSV line, handling quoted values correctly
      const parseLine = (line: string): string[] => {
        const values: string[] = [];
        let inQuote = false;
        let currentValue = '';
        
        for (let j = 0; j < line.length; j++) {
          const char = line[j];
          
          if (char === '\'' && (j === 0 || line[j-1] !== '\\')) {
            inQuote = !inQuote;
          } else if (char === ',' && !inQuote) {
            values.push(currentValue);
            currentValue = '';
          } else if (char !== '\'') {
            currentValue += char;
          }
        }
        
        // Add the last value
        values.push(currentValue);
        return values;
      };
      
      const values = parseLine(line);
      
      if (values.length >= 7) {
        gliders.push({
          deviceType: values[0],
          deviceId: values[1],
          aircraftModel: values[2],
          registration: values[3],
          competitionNumber: values[4],
          tracked: values[5].toUpperCase() === 'Y',
          identified: values[6].toUpperCase() === 'Y'
        });
      }
    }
    
    return gliders;
  } catch (error) {
    console.error('Error parsing glider database:', error);
    return [];
  }
}

/**
 * Looks up information for a glider by its FLARM ID
 */
export async function getGliderByFlarmId(flarmId: string): Promise<GliderData | null> {
  try {
    const gliders = await parseGliderDatabase();
    return gliders.find(glider => glider.deviceId.toUpperCase() === flarmId.toUpperCase()) || null;
  } catch (error) {
    console.error('Error looking up glider by FLARM ID:', error);
    return null;
  }
} 