import { prisma } from '@/lib/prisma'

/**
 * Airfields that must exist in the system on every deploy, so the OGN backend tracks
 * takeoffs/landings there.
 *
 * This is the data-driven counterpart of `scripts/add-airfield.js`. It is run once per
 * server start by the Next.js instrumentation hook (see `instrumentation.ts`) and is fully
 * idempotent: the first deploy creates the records, later deploys are no-ops.
 *
 * To add an away-camp airfield: add an entry here, then push. Removing an entry does NOT
 * delete the airfield — the Danish airfield feed in the OGN backend is upsert-only — but it
 * stops re-attaching it to the club on boot.
 */
type StartupAirfield = {
  /** ICAO code; also used as the unique `ident` in dk_airfields. */
  icao: string
  name: string
  /** OurAirports-style type, e.g. "small_airport". */
  type: string
  municipality?: string
  latitude_deg: number
  longitude_deg: number
  /** Elevation above sea level in metres (MSL). */
  alt_over_sea: number
  /** If set, add this ICAO to the allowed_airfields of the club whose homefield matches. */
  attachToClubHomefield?: string
}

const STARTUP_AIRFIELDS: StartupAirfield[] = [
  {
    icao: 'EPZP',
    name: 'Zielona Góra-Przylep',
    type: 'small_airport',
    municipality: 'Zielona Góra',
    latitude_deg: 51.979,
    longitude_deg: 15.464,
    alt_over_sea: 77,
    attachToClubHomefield: 'EKFS',
  },
]

export async function ensureStartupAirfields(): Promise<void> {
  for (const af of STARTUP_AIRFIELDS) {
    // Use the ICAO as the unique `ident` so foreign airfields don't collide with the Danish
    // feed's "DK-xxxx" idents and survive its upsert-only refreshes.
    const airfieldData = {
      type: af.type,
      name: af.name,
      municipality: af.municipality,
      icao: af.icao,
      latitude_deg: af.latitude_deg,
      longitude_deg: af.longitude_deg,
      alt_over_sea: af.alt_over_sea,
    }
    await prisma.dkAirfields.upsert({
      where: { ident: af.icao },
      update: airfieldData,
      create: { ident: af.icao, ...airfieldData },
    })

    if (!af.attachToClubHomefield) continue

    const club = await prisma.club.findFirst({
      where: { homefield: af.attachToClubHomefield },
      select: { id: true, name: true, allowed_airfields: true },
    })
    if (!club) {
      console.warn(`[startup-seed] No club with homefield "${af.attachToClubHomefield}"; ${af.icao} not attached to any club.`)
      continue
    }
    if ((club.allowed_airfields ?? []).includes(af.icao)) continue

    await prisma.club.update({
      where: { id: club.id },
      data: { allowed_airfields: { push: af.icao } },
    })
    console.log(`[startup-seed] Added ${af.icao} to club "${club.name}" allowed_airfields.`)
  }
}
