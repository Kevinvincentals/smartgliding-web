import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { z } from 'zod';

/**
 * Installation request schema
 */
const installationSchema = z.object({
  club: z.object({
    name: z.string().min(1, 'Club name is required'),
    street: z.string().min(1, 'Street is required'),
    zip: z.string().min(1, 'ZIP code is required'),
    city: z.string().min(1, 'City is required'),
    country: z.string().min(1, 'Country is required'),
    website: z.string().optional(),
    email: z.string().email().optional().or(z.literal('')),
    contactName: z.string().optional(),
    contactPhone: z.string().optional(),
    club_pin: z.string().regex(/^\d{4}$/, 'Club PIN must be exactly 4 digits').optional().or(z.literal('')),
    homefield: z.string().min(1, 'Homefield ICAO code is required').max(4, 'Homefield must be 4 characters')
  }),
  pilot: z.object({
    firstname: z.string().min(1, 'First name is required'),
    lastname: z.string().min(1, 'Last name is required'),
    email: z.string().email('Valid email is required'),
    password: z.string().min(6, 'Password must be at least 6 characters'),
    phone: z.string().optional()
  }),
  planes: z.array(z.object({
    registration_id: z.string().min(1, 'Registration ID is required'),
    type: z.string().min(1, 'Plane type is required'),
    is_twoseater: z.boolean().default(false),
    flarm_id: z.string().optional(),
    competition_id: z.string().optional(),
    year_produced: z.number().optional(),
    notes: z.string().optional()
  })).min(1, 'At least one plane is required')
});

interface ApiResponse {
  success: boolean;
  error?: string;
  needsInstall?: boolean;
  data?: any;
}

// DSVU Catalog Data
const catalogData = {
  "G-1": {
    "titel": "Fortrolighed med svæveflyet",
    "øvelser": [
      "Svæveflyets opbygning",
      "Cockpit, instrumenter og udstyr",
      "Rorbetjening: styrepind, pedaler, luftbremser, trim og evt. flaps",
      "Wireudløser",
      "Betjening af understel og hjulbremser",
      "Checklister, afprøvning og kontrol"
    ]
  },
  "G-2": {
    "titel": "Nødprocedurer",
    "øvelser": [
      "Brug af sikkerhedsudstyr (faldskærm)",
      "Reaktioner på systemfejl og fejlbetjening",
      "Øvelse i procedure for udspring",
      "Øvelse i landing med faldskærm i tilfælde af nødudspring",
      "Sikkerhed og rapportering"
    ]
  },
  "G-3": {
    "titel": "Forberedelse til flyvning",
    "øvelser": [
      "Briefing før skoleflyvning",
      "Nødvendige dokumenter ombord og på flyvepladsen",
      "Udstyr som skal bruges til påtænkt flyvning",
      "Håndtering af skolefly på jorden, herunder samling, tilslutning af ror, flytning af flyet fra hangar til startsted, parkering og sikring",
      "Udvendige og indvendige eftersyn på flyet",
      "Sikring af vægt og balance",
      "Justering af seler, sæder og pedaler",
      "Aftalt rollefordeling i uventede situationer",
      "Check før start"
    ]
  },
  "G-4": {
    "titel": "Tilvænningsflyvning",
    "øvelser": [
      "Kendskab til området omkring flyvepladsen",
      "Procedure for udkig"
    ]
  },
  "G-5": {
    "titel": "Fartkontrol og rorenes virkning",
    "øvelser": [
      "Procedure for udkig",
      "Brug af visuelle referencer",
      "Effekter under ligeudflyvning og under krængning",
      "Flyets stilling ift. horisonten og virkningen af højderor",
      "Sammenhængen mellem flyets stilling og hastighed",
      "Betydningen af krængerorenes sekundære virkning",
      "Virkningen af luftbremser, flaps og understel (hvis aktuelt)"
    ]
  },
  "G-6": {
    "titel": "Koordineret indgang i og udgang af moderate krængninger",
    "øvelser": [
      "Procedure for udkig",
      "Yderligere effekt af krængeror (sekundær virkning) og sideror (rul)",
      "Koordinering af side- og krængeror",
      "Indgang i og udgang af moderate krængninger og tilbage til vandret flyvning"
    ]
  },
  "G-7": {
    "titel": "Flyvning ligeud og på kurs",
    "øvelser": [
      "Procedure for udkig",
      "Fastholdelse af ligeudflyvning",
      "Flyvning ved kritisk høje hastigheder",
      "Demonstration af flyets egen længdestabilitet",
      "Kontrol af dykvinkel incl. brug af trim",
      "Normalstilling, retning, balance og trim",
      "Flyvehastighed - overvågning og påvirkning"
    ]
  },
  "G-8": {
    "titel": "Drej",
    "øvelser": [
      "Procedure for udkig",
      "Demonstration og korrektion for krængerorenes sekundære virkning",
      "Indgang i drej (moderat krængning)",
      "Fastholdelse af drejet",
      "Udgang af drejet",
      "Fejl i drejet (sideglidning, udskridning og fartkontrol)",
      "Udkig under drejet - ligefrem og ud til siden",
      "Drej til bestemte kurser - brug af kompas",
      "Brug af instrumenter til det perfekte drej (kugle = krængningsviser og uldsnor)"
    ]
  },
  "G-9": {
    "titel": "Spilstart",
    "øvelser": [
      "Signaler og kommunikation før og under en spilstart",
      "Brug af udstyr i forbindelse med spilstart",
      "Cockpitcheck før spilstart",
      "Spilstart i direkte modvind",
      "Spilstart i sidevind",
      "Begrænsninger i en spilstart med profilen for en korrekt og sikker spilstart",
      "Procedure for udløsning af startwiren",
      "Procedure for fejltilstande, som simuleres under spilstarten",
      "Varslet simuleret afbrudt start i stor højde",
      "Varslet simuleret afbrudt start i højde op til 100 meter",
      "Varslet simuleret afbrudt start i mellemhøjde"
    ]
  },
  "G-10": {
    "titel": "Langsomflyvning",
    "øvelser": [
      "Udkig og sikkerhedscheck",
      "Introduktion til karakteristika ved langsomflyvning",
      "Kontrolleret flyvning ned til kritisk høj indfaldsvinkel (langsom flyvehastighed)",
      "Uvarslet afbrudt start i stor højde = >300 meter/1000 fod ved spilstart"
    ]
  },
  "G-11": {
    "titel": "Landingsrunde, indflyvning og landing",
    "øvelser": [
      "Procedure for at gå ind i en korrekt landingsrunde",
      "Undgåelse af kollision - teknik og procedurer for udkig",
      "Cockpitcheck før landing. Procedure for landingsrunde, medvindsben og base",
      "Vindens indflydelse på landingsrunden, wind shear på indflyvningen og sætningshastighed",
      "Brug af flaps hvis aktuelt",
      "Visualisering af sigtepunktet",
      "Regulering af indflyvningen vha. luftbremser",
      "Udfladning og sætning",
      "Indflyvning under forskellige vindforhold - herunder sidevind",
      "Procedure og teknik for en kort landing"
    ]
  },
  "G-12": {
    "titel": "Stall og sideglidning",
    "øvelser": [
      "Udkig og sikkerhedscheck",
      "Symptomer før et stall, erkendelse og genopretning",
      "Symptomer på stall, erkendelse og genopretning under ligeudflyvning og under drej",
      "Genopretning hvis en vinge dykker",
      "Risiko for stall under indflyvning og i landingskonfiguration",
      "Erkendelse af og udretning fra accelerede stalls (Stor G-påvirkning eller krængning)",
      "Sideglidning mod punkt i horisonten eller langs linje på jorden",
      "Uvarslet afbrudt start i lav højde - </= 100 meter/300 fod med landing lige frem på pladsen ved spilstart"
    ]
  },
  "G-13": {
    "titel": "Erkendelse og forebyggelse af spin og spiraldyk",
    "øvelser": [
      "Udkig og sikkerhedscheck",
      "Stall med opretning fra det første stadie i et spin (Stall med uprovokeret rul/dyk af vinge til ca. 45 grader og tilhørende bevægelse)",
      "Erkendelse af indgangen i et fuldt udviklet spin",
      "Erkendelse af et fuldt udviklede spin",
      "Standardprocedure for udretning af spin",
      "Distraktion foretaget af instruktøren ifm. indgang i spin",
      "Erkendelse af styrtspiral",
      "Udretning fra styrtspiral",
      "Differentiering mellem spin og styrtspiral",
      "Uvarslet afbrudt start i mellemhøjde - >100 meter/300 fod <200 meter/650 fod ved spilstart"
    ]
  },
  "U-14": {
    "titel": "Første soloflyvning",
    "øvelser": [
      "Gennemført træning i brug af flyets radio, hvis eleven ikke har radiocertifikat - UHB975",
      "Relevant teori forud for soloflyvning, hvis eleven ikke har bestået SPL-teoriprøven",
      "Instruktørens briefing incl. begrænsninger",
      "Lokalområdet og restriktioner",
      "Brug af nødvendigt udstyr",
      "Effekt på tyngdepunktets placering og flyets manøvredygtighed",
      "Min. tre soloflyvninger på skoleflyet med instruktørens efterfølgende debriefing",
      "Omskoling til en-sædet svævefly - Håndbog",
      "En-sædet svævefly - Systemkendskab - adskillelse og samling - Indretning af cockpit",
      "En-sædet svævefly - spilstart",
      "En-sædet svævefly - drej og kurveskift",
      "En-sædet svævefly - hurtig flyvning",
      "En-sædet svævefly - langsomflyvning og stall",
      "En-sædet svævefly - mærkelanding"
    ]
  },
  "U-15": {
    "titel": "Avancerede drej",
    "øvelser": [
      "Drej med stor krængning (45 grader eller mere)",
      "Forebyggelse af stalls og spin under drej samt genopretning",
      "Genopretning fra unormale flyvestillinger incl. styrtspiral"
    ]
  },
  "U-16": {
    "titel": "Termikflyvning",
    "øvelser": [
      "Procedure for udkig",
      "Termiksøgning og -erkendelse",
      "Brug af lydsignaler fra instrumenterne",
      "Indgang i opvindsområdet og placering ift. andre svævefly",
      "Flyvning tæt på andre svævefly",
      "Centrering af termikken",
      "Teknik til at forlade termikken",
      "Overvejelse om evt. brug af ilt"
    ]
  },
  "U-17": {
    "titel": "Udelandinger",
    "øvelser": [
      "Glideafstand og muligheder",
      "Genstartprocedure (kun selvstartende og turbo svævefly)",
      "Beslutningsproces om ikke at genstarte motor, men vælge at udelande (kun selvstartende og turbo svævefly)",
      "Udvælgelse af egnede landingsområder",
      "Bedømmelse af landingsrunde og nøglepositioner",
      "Procedurer for landingsrunde og indflyvning",
      "Bestemmelse af vindretning",
      "Valg af landingsretning",
      "Overvejelser ved landing i kuperet terræn",
      "Handlinger efter landing"
    ]
  },
  "U-18": {
    "titel": "Planlægning af strækflyvning",
    "øvelser": [
      "Aktuelt vejr og vejrudsigter",
      "NOTAM's og betragtninger om luftrum",
      "Valg af flyvekort og forberedelse af kortet",
      "Planlægning af ruten",
      "Radiofrekvenser hvis aktuelt",
      "Administrative procedurer før start incl. nødvendigt ekstra udstyr - f.eks. nødsender, redningsvest osv.)",
      "ATC flyveplan hvis aktuelt",
      "Vægtberegning ift. flyets præstation",
      "Beregning af vægt og balance",
      "Alternative landingsmuligheder - flyvepladser og egnede landingsområder",
      "Sikkerhedshøjder"
    ]
  },
  "U-19": {
    "titel": "Navigation under strækflyvning",
    "øvelser": [
      "Fastholdelse af ruten og overvejelser om at afvige fra den planlagte rute.",
      "Brug af radio og fraseologi - hvis aktuelt",
      "Planlægning under flyvningen",
      "Procedure for gennemflyvning af kontrolleret luftrum samt klarering, hvis dette er aktuelt",
      "Procedure ved usikkerhed om positionen",
      "Procedure hvis man ikke længere ved, hvor man er",
      "Brug af supplerende udstyr hvis nødvendigt",
      "Ankomst til og indgang i landingsrunden til en fremmed flyveplads"
    ]
  },
  "U-20": {
    "titel": "Strækflyvningsteknikker",
    "øvelser": [
      "Procedure for udkig",
      "Maksimering af potentialet i strækflyvningen",
      "Reduktion af risici og reaktion på trusler"
    ]
  }
};

const minimumRequirements = {
  minimum_starter: 45,
  minimum_flyvetimer: 15,
  minimum_to_sædet_skoling: 10,
  minimum_solo_flyvning: 2
};

/**
 * Function to populate DSVU catalog data
 */
async function populateDsvuCatalog(tx: any) {
  console.log('📚 Populating DSVU catalog...');
  
  // Clear existing DSVU data
  await tx.dkDsvuSchoolCatalog.deleteMany();
  await tx.dkDsvuSchoolRequirements.deleteMany();

  // Create modules with nested exercises
  const modulePromises = Object.entries(catalogData).map(async ([moduleId, moduleData]) => {
    // Generate unique IDs for each exercise
    const exercisesWithIds = moduleData.øvelser.map((exerciseText, index) => {
      // Create a unique ID like "g1_ex_001", "g2_ex_001", "u14_ex_001"
      const modulePrefix = moduleId.toLowerCase().replace('-', '');
      const exerciseId = `${modulePrefix}_ex_${String(index + 1).padStart(3, '0')}`;
      
      return {
        id: exerciseId,
        text: exerciseText,
        order: index
      };
    });
    
    // Create the module with exercises as nested JSON
    return await tx.dkDsvuSchoolCatalog.create({
      data: {
        moduleId: moduleId,
        titel: moduleData.titel,
        exercises: exercisesWithIds // Store exercises with unique IDs
      }
    });
  });

  // Wait for all modules to be created
  await Promise.all(modulePromises);

  // Create minimum requirements
  await tx.dkDsvuSchoolRequirements.create({
    data: minimumRequirements
  });

  // Calculate total exercises for logging
  const totalExercises = Object.values(catalogData).reduce((total, module) => {
    return total + module.øvelser.length;
  }, 0);

  console.log(`✅ DSVU catalog populated: ${Object.keys(catalogData).length} modules, ${totalExercises} exercises`);
}

// GET handler to check if installation is needed
export async function GET(): Promise<NextResponse<ApiResponse>> {
  try {
    // Check if any clubs exist
    const clubCount = await prisma.club.count();
    
    // Check if any pilots exist
    const pilotCount = await prisma.pilot.count();
    
    // Installation is needed if there are no clubs OR no pilots
    const needsInstall = clubCount === 0 || pilotCount === 0;
    
    return NextResponse.json<ApiResponse>({
      success: true,
      needsInstall
    });
  } catch (error: unknown) {
    console.error('Error checking installation status:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return NextResponse.json<ApiResponse>(
      { success: false, error: `Failed to check installation status: ${errorMessage}` },
      { status: 500 }
    );
  }
}

// POST handler to perform installation
export async function POST(request: NextRequest): Promise<NextResponse<ApiResponse>> {
  try {
    // Parse and validate request body
    const body = await request.json();
    
    const validation = installationSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json<ApiResponse>(
        { 
          success: false, 
          error: 'Validation failed: ' + validation.error.errors.map(e => e.message).join(', ')
        },
        { status: 400 }
      );
    }

    const { club: clubData, pilot: pilotData, planes: planesData } = validation.data;

    // Check if installation is still needed
    const clubCount = await prisma.club.count();
    const pilotCount = await prisma.pilot.count();
    
    if (clubCount > 0 && pilotCount > 0) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: 'Installation is no longer needed - system is already set up' },
        { status: 400 }
      );
    }

    // Check if pilot email already exists
    const existingPilot = await prisma.pilot.findFirst({
      where: { email: pilotData.email }
    });

    if (existingPilot) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: 'A pilot with this email already exists' },
        { status: 400 }
      );
    }

    // Check if any plane registration already exists
    for (const plane of planesData) {
      const existingPlane = await prisma.plane.findUnique({
        where: { registration_id: plane.registration_id }
      });
      
      if (existingPlane) {
        return NextResponse.json<ApiResponse>(
          { success: false, error: `Plane with registration ${plane.registration_id} already exists` },
          { status: 400 }
        );
      }
    }

    // Start transaction to create everything atomically
    const result = await prisma.$transaction(async (tx) => {
      // 1. Hash the pilot password
      const hashedPassword = await bcrypt.hash(pilotData.password, 12);

      // 2. Create the pilot first
      const pilot = await tx.pilot.create({
        data: {
          firstname: pilotData.firstname,
          lastname: pilotData.lastname,
          email: pilotData.email,
          password: hashedPassword,
          phone: pilotData.phone || undefined,
          status: 'ACTIVE',
          membership: 'PREMIUM',
          is_admin: true
        }
      });

      // 3. Create the club
      const club = await tx.club.create({
        data: {
          name: clubData.name,
          street: clubData.street,
          zip: clubData.zip,
          city: clubData.city,
          country: clubData.country,
          website: clubData.website || undefined,
          email: clubData.email || undefined,
          contactName: clubData.contactName || undefined,
          contactPhone: clubData.contactPhone || undefined,
          club_pin: clubData.club_pin ? parseInt(clubData.club_pin, 10) : undefined,
          homefield: clubData.homefield,
          createdById: pilot.id
        }
      });

      // 4. Assign pilot as admin of the club
      await tx.clubPilot.create({
        data: {
          pilotId: pilot.id,
          clubId: club.id,
          role: 'ADMIN'
        }
      });

      // 5. Create planes
      const planes = await Promise.all(
        planesData.map(plane => 
          tx.plane.create({
            data: {
              registration_id: plane.registration_id,
              type: plane.type,
              is_twoseater: plane.is_twoseater,
              is_guest: false,
              flarm_id: plane.flarm_id || undefined,
              competition_id: plane.competition_id || undefined,
              year_produced: plane.year_produced || undefined,
              notes: plane.notes || undefined,
              clubId: club.id,
              createdById: pilot.id
            }
          })
        )
      );

      // 6. Populate DSVU catalog automatically
      await populateDsvuCatalog(tx);

      return {
        pilot,
        club,
        planes
      };
    });

    return NextResponse.json<ApiResponse>({
      success: true,
      data: {
        message: 'Installation completed successfully (including DSVU catalog)',
        club: {
          id: result.club.id,
          name: result.club.name
        },
        pilot: {
          id: result.pilot.id,
          name: `${result.pilot.firstname} ${result.pilot.lastname}`,
          email: result.pilot.email
        },
        planesCreated: result.planes.length,
        dsvuCatalogPopulated: true
      }
    });

  } catch (error: any) {
    console.error('Installation error:', error);
    
    // Handle specific Prisma errors
    if (error.code === 'P2002') {
      return NextResponse.json<ApiResponse>(
        { success: false, error: 'A record with this unique field already exists' },
        { status: 400 }
      );
    }
    
    return NextResponse.json<ApiResponse>(
      { success: false, error: 'Installation failed: ' + error.message },
      { status: 500 }
    );
  }
} 