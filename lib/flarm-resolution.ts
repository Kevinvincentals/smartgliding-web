/**
 * FLARM ID Resolution Utility
 *
 * This utility provides functions to resolve FLARM IDs to aircraft registrations
 * using the club's local database, falling back to OGN database if needed.
 */

import { prisma } from '@/lib/prisma'
import { getGliderByFlarmId } from '@/lib/flightLogbook'

export interface FlarmResolutionResult {
  registration: string
  flarmId: string
  source: 'club' | 'ogn' | 'fallback'
  aircraftType?: string
  competitionId?: string
  isClubPlane?: boolean
}

/**
 * Resolve FLARM ID to aircraft registration using club database and OGN fallback
 *
 * @param flarmId - The FLARM ID to resolve (e.g., "478DE3")
 * @param clubId - Optional club ID to filter results
 * @returns Promise<FlarmResolutionResult>
 */
export async function resolveFlarmId(
  flarmId: string,
  clubId?: string
): Promise<FlarmResolutionResult> {

  // Sanitize FLARM ID - remove any FLARM- prefix and clean whitespace
  const cleanFlarmId = flarmId.replace(/^FLARM-/i, '').trim().toUpperCase()

  try {
    // First priority: Check club planes database
    const clubPlane = await prisma.plane.findFirst({
      where: {
        flarm_id: cleanFlarmId,
        ...(clubId && { clubId })
      },
      include: {
        club: {
          select: {
            id: true,
            name: true
          }
        }
      }
    })

    if (clubPlane) {
      return {
        registration: clubPlane.registration_id,
        flarmId: cleanFlarmId,
        source: 'club',
        aircraftType: clubPlane.type,
        competitionId: clubPlane.competition_id || undefined,
        isClubPlane: true
      }
    }

    // Second priority: Check OGN database
    const ognResult = await getGliderByFlarmId(cleanFlarmId)

    if (ognResult && ognResult.registration) {
      return {
        registration: ognResult.registration,
        flarmId: cleanFlarmId,
        source: 'ogn',
        aircraftType: ognResult.aircraftModel || undefined,
        competitionId: ognResult.competitionNumber || undefined,
        isClubPlane: false
      }
    }

    // Fallback: Use FLARM-XXXX format
    const fallbackRegistration = `FLARM-${cleanFlarmId.substring(0, 6)}`

    return {
      registration: fallbackRegistration,
      flarmId: cleanFlarmId,
      source: 'fallback',
      isClubPlane: false
    }

  } catch (error) {
    console.error('Error resolving FLARM ID:', error)

    // Error fallback: Use FLARM-XXXX format
    const fallbackRegistration = `FLARM-${cleanFlarmId.substring(0, 6)}`

    return {
      registration: fallbackRegistration,
      flarmId: cleanFlarmId,
      source: 'fallback',
      isClubPlane: false
    }
  }
}

/**
 * Batch resolve multiple FLARM IDs efficiently
 *
 * @param flarmIds - Array of FLARM IDs to resolve
 * @param clubId - Optional club ID to filter results
 * @returns Promise<Map<string, FlarmResolutionResult>>
 */
export async function batchResolveFlarmIds(
  flarmIds: string[],
  clubId?: string
): Promise<Map<string, FlarmResolutionResult>> {
  const results = new Map<string, FlarmResolutionResult>()

  if (flarmIds.length === 0) {
    return results
  }

  // Clean and deduplicate FLARM IDs
  const cleanFlarmIds = [...new Set(flarmIds.map(id =>
    id.replace(/^FLARM-/i, '').trim().toUpperCase()
  ))]

  try {
    // Batch fetch club planes
    const clubPlanes = await prisma.plane.findMany({
      where: {
        flarm_id: { in: cleanFlarmIds },
        ...(clubId && { clubId })
      },
      include: {
        club: {
          select: {
            id: true,
            name: true
          }
        }
      }
    })

    // Create lookup map for club planes
    const clubPlaneMap = new Map(
      clubPlanes.map(plane => [plane.flarm_id!, plane])
    )

    // Resolve each FLARM ID
    for (const cleanFlarmId of cleanFlarmIds) {
      const clubPlane = clubPlaneMap.get(cleanFlarmId)

      if (clubPlane) {
        results.set(cleanFlarmId, {
          registration: clubPlane.registration_id,
          flarmId: cleanFlarmId,
          source: 'club',
          aircraftType: clubPlane.type,
          competitionId: clubPlane.competition_id || undefined,
          isClubPlane: true
        })
      } else {
        // For now, fallback to individual OGN lookup
        // TODO: Optimize with batch OGN lookup if available
        try {
          const ognResult = await getGliderByFlarmId(cleanFlarmId)

          if (ognResult && ognResult.registration) {
            results.set(cleanFlarmId, {
              registration: ognResult.registration,
              flarmId: cleanFlarmId,
              source: 'ogn',
              aircraftType: ognResult.aircraftModel || undefined,
              competitionId: ognResult.competitionNumber || undefined,
              isClubPlane: false
            })
          } else {
            // Fallback
            results.set(cleanFlarmId, {
              registration: `FLARM-${cleanFlarmId.substring(0, 6)}`,
              flarmId: cleanFlarmId,
              source: 'fallback',
              isClubPlane: false
            })
          }
        } catch (error) {
          console.error(`Error resolving FLARM ID ${cleanFlarmId}:`, error)
          results.set(cleanFlarmId, {
            registration: `FLARM-${cleanFlarmId.substring(0, 6)}`,
            flarmId: cleanFlarmId,
            source: 'fallback',
            isClubPlane: false
          })
        }
      }
    }

  } catch (error) {
    console.error('Error in batch FLARM ID resolution:', error)

    // Fallback for all IDs
    cleanFlarmIds.forEach(flarmId => {
      results.set(flarmId, {
        registration: `FLARM-${flarmId.substring(0, 6)}`,
        flarmId: flarmId,
        source: 'fallback',
        isClubPlane: false
      })
    })
  }

  return results
}

/**
 * Check if a FLARM ID is registered in the club database
 *
 * @param flarmId - The FLARM ID to check
 * @param clubId - Optional club ID to filter results
 * @returns Promise<boolean>
 */
export async function isClubFlarmId(
  flarmId: string,
  clubId?: string
): Promise<boolean> {
  const cleanFlarmId = flarmId.replace(/^FLARM-/i, '').trim().toUpperCase()

  try {
    const count = await prisma.plane.count({
      where: {
        flarm_id: cleanFlarmId,
        ...(clubId && { clubId })
      }
    })

    return count > 0
  } catch (error) {
    console.error('Error checking club FLARM ID:', error)
    return false
  }
}

/**
 * Get all registered FLARM IDs for a club (for caching purposes)
 *
 * @param clubId - Club ID to get FLARM IDs for
 * @returns Promise<Map<string, string>> - Map of FLARM ID to registration
 */
export async function getClubFlarmIdMap(clubId: string): Promise<Map<string, string>> {
  try {
    const planes = await prisma.plane.findMany({
      where: {
        clubId,
        flarm_id: { not: null }
      },
      select: {
        flarm_id: true,
        registration_id: true
      }
    })

    return new Map(
      planes
        .filter(plane => plane.flarm_id)
        .map(plane => [plane.flarm_id!, plane.registration_id])
    )
  } catch (error) {
    console.error('Error getting club FLARM ID map:', error)
    return new Map()
  }
}