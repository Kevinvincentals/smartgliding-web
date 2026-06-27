/**
 * Add an airfield to the system and (optionally) register it as an allowed airfield
 * for a club, so the OGN backend starts tracking takeoffs/landings there.
 *
 * Idempotent: safe to run repeatedly. The OGN backend must be restarted afterwards to
 * pick up the new airfield in its APRS filter (see services/db.py build_aprs_filter()).
 *
 * Usage:
 *   node scripts/add-airfield.js                 # uses the EPZP defaults below
 *   AIRFIELD_ICAO=EPZR AIRFIELD_NAME="Żar" AIRFIELD_LAT=49.7625 AIRFIELD_LON=19.2181 \
 *     AIRFIELD_ELEV=420 CLUB_HOMEFIELD=EKFS node scripts/add-airfield.js
 *
 * Env vars (all optional; defaults target the EPZP summer camp):
 *   AIRFIELD_ICAO   - ICAO code, also used as the unique `ident` (default "EPZP")
 *   AIRFIELD_NAME   - Display name (default "Zielona Góra-Przylep")
 *   AIRFIELD_TYPE   - OurAirports-style type (default "small_airport")
 *   AIRFIELD_MUNI   - Municipality (default "Zielona Góra")
 *   AIRFIELD_LAT    - Latitude in degrees (default 51.979)
 *   AIRFIELD_LON    - Longitude in degrees (default 15.464)
 *   AIRFIELD_ELEV   - Elevation above sea level in metres (default 77)
 *   CLUB_HOMEFIELD  - Attach the airfield to the club whose homefield is this ICAO
 *                     (default "EKFS"). Set to "" / "none" to skip club attachment.
 */

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const airfield = {
  icao: process.env.AIRFIELD_ICAO || 'EPZP',
  name: process.env.AIRFIELD_NAME || 'Zielona Góra-Przylep',
  type: process.env.AIRFIELD_TYPE || 'small_airport',
  municipality: process.env.AIRFIELD_MUNI || 'Zielona Góra',
  latitude_deg: parseFloat(process.env.AIRFIELD_LAT || '51.979'),
  longitude_deg: parseFloat(process.env.AIRFIELD_LON || '15.464'),
  alt_over_sea: parseInt(process.env.AIRFIELD_ELEV || '77', 10),
};

const clubHomefield = process.env.CLUB_HOMEFIELD === undefined ? 'EKFS' : process.env.CLUB_HOMEFIELD;
const attachToClub = clubHomefield && clubHomefield.toLowerCase() !== 'none';

async function addAirfield() {
  console.log(`🚀 Adding airfield ${airfield.icao} (${airfield.name})...`);

  // Use the ICAO code as the unique `ident` so foreign airfields don't collide with the
  // Danish feed's "DK-xxxx" idents and survive its upsert-only refreshes.
  const record = await prisma.dkAirfields.upsert({
    where: { ident: airfield.icao },
    update: {
      type: airfield.type,
      name: airfield.name,
      municipality: airfield.municipality,
      icao: airfield.icao,
      latitude_deg: airfield.latitude_deg,
      longitude_deg: airfield.longitude_deg,
      alt_over_sea: airfield.alt_over_sea,
    },
    create: {
      ident: airfield.icao,
      type: airfield.type,
      name: airfield.name,
      municipality: airfield.municipality,
      icao: airfield.icao,
      latitude_deg: airfield.latitude_deg,
      longitude_deg: airfield.longitude_deg,
      alt_over_sea: airfield.alt_over_sea,
    },
  });
  console.log(`  ✓ dk_airfields upserted: ${record.icao} @ (${record.latitude_deg}, ${record.longitude_deg}), ${record.alt_over_sea} m MSL`);

  if (!attachToClub) {
    console.log('ℹ️  Skipping club attachment (CLUB_HOMEFIELD not set).');
    return;
  }

  const club = await prisma.club.findFirst({
    where: { homefield: clubHomefield },
    select: { id: true, name: true, allowed_airfields: true },
  });

  if (!club) {
    console.warn(`⚠️  No club found with homefield "${clubHomefield}". Airfield added but not attached to any club.`);
    return;
  }

  if ((club.allowed_airfields || []).includes(airfield.icao)) {
    console.log(`  ✓ ${airfield.icao} already in allowed_airfields for "${club.name}" — nothing to do.`);
  } else {
    const updated = await prisma.club.update({
      where: { id: club.id },
      data: { allowed_airfields: { push: airfield.icao } },
      select: { allowed_airfields: true },
    });
    console.log(`  ✓ Added ${airfield.icao} to "${club.name}". allowed_airfields = [${updated.allowed_airfields.join(', ')}]`);
  }
}

addAirfield()
  .then(() => {
    console.log('✅ Done. Restart the smartgliding-ogn-backend so it rebuilds its APRS filter.');
  })
  .catch((error) => {
    console.error('❌ Error adding airfield:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
