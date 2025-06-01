import { prisma } from '@/lib/prisma';

interface GliderData {
  deviceType: string;
  deviceId: string;
  aircraftModel: string | null;
  registration: string | null;
  competitionNumber: string | null;
  tracked: boolean;
  identified: boolean;
}

/**
 * Gets all glider data from the database
 */
export async function getAllGliders(): Promise<GliderData[]> {
  try {
    const gliders = await prisma.ognDatabase.findMany({
      select: {
        deviceType: true,
        deviceId: true,
        aircraftModel: true,
        registration: true,
        cn: true,
        tracked: true,
        identified: true
      }
    });
    
    return gliders.map(glider => ({
      deviceType: glider.deviceType,
      deviceId: glider.deviceId,
      aircraftModel: glider.aircraftModel,
      registration: glider.registration,
      competitionNumber: glider.cn,
      tracked: glider.tracked,
      identified: glider.identified
    }));
  } catch (error) {
    console.error('Error fetching gliders from database:', error);
    return [];
  }
}

/**
 * Looks up information for a glider by its FLARM ID
 */
export async function getGliderByFlarmId(flarmId: string): Promise<GliderData | null> {
  try {
    const glider = await prisma.ognDatabase.findUnique({
      where: {
        deviceId: flarmId.toUpperCase()
      },
      select: {
        deviceType: true,
        deviceId: true,
        aircraftModel: true,
        registration: true,
        cn: true,
        tracked: true,
        identified: true
      }
    });
    
    if (!glider) {
      return null;
    }
    
    return {
      deviceType: glider.deviceType,
      deviceId: glider.deviceId,
      aircraftModel: glider.aircraftModel,
      registration: glider.registration,
      competitionNumber: glider.cn,
      tracked: glider.tracked,
      identified: glider.identified
    };
  } catch (error) {
    console.error('Error looking up glider by FLARM ID:', error);
    return null;
  }
}

/**
 * Searches for gliders by registration
 */
export async function getGlidersByRegistration(registration: string): Promise<GliderData[]> {
  try {
    const gliders = await prisma.ognDatabase.findMany({
      where: {
        registration: {
          contains: registration,
          mode: 'insensitive'
        }
      },
      select: {
        deviceType: true,
        deviceId: true,
        aircraftModel: true,
        registration: true,
        cn: true,
        tracked: true,
        identified: true
      },
      take: 10 // Limit results
    });
    
    return gliders.map(glider => ({
      deviceType: glider.deviceType,
      deviceId: glider.deviceId,
      aircraftModel: glider.aircraftModel,
      registration: glider.registration,
      competitionNumber: glider.cn,
      tracked: glider.tracked,
      identified: glider.identified
    }));
  } catch (error) {
    console.error('Error searching gliders by registration:', error);
    return [];
  }
}

/**
 * Searches for gliders by competition number
 */
export async function getGlidersByCompetitionNumber(competitionNumber: string): Promise<GliderData[]> {
  try {
    const gliders = await prisma.ognDatabase.findMany({
      where: {
        cn: {
          contains: competitionNumber,
          mode: 'insensitive'
        }
      },
      select: {
        deviceType: true,
        deviceId: true,
        aircraftModel: true,
        registration: true,
        cn: true,
        tracked: true,
        identified: true
      },
      take: 10 // Limit results
    });
    
    return gliders.map(glider => ({
      deviceType: glider.deviceType,
      deviceId: glider.deviceId,
      aircraftModel: glider.aircraftModel,
      registration: glider.registration,
      competitionNumber: glider.cn,
      tracked: glider.tracked,
      identified: glider.identified
    }));
  } catch (error) {
    console.error('Error searching gliders by competition number:', error);
    return [];
  }
} 