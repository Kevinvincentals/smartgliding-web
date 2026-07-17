import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { broadcastToClients } from '@/lib/websocket/utils';
import { JWTPayload } from '@/lib/jwt';
import { z } from 'zod';

const claimSchema = z.object({
  deviceId: z.string().uuid('deviceId must be a UUID')
});

// POST handler to claim the startbord role for this tablet (last writer wins).
// Broadcasts startbord_changed so a previously claiming tablet stops its beacon.
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const jwtPayloadString = request.headers.get('x-jwt-payload');
    if (!jwtPayloadString) {
      return NextResponse.json({ success: false, error: 'Authentication token not found.' }, { status: 401 });
    }
    const jwtPayload: JWTPayload = JSON.parse(jwtPayloadString);
    const clubId = jwtPayload.clubId || jwtPayload.id;
    const airfield = jwtPayload.selectedAirfield || jwtPayload.homefield;

    if (!clubId || !airfield) {
      return NextResponse.json({ success: false, error: 'Club or airfield not found in authentication token.' }, { status: 401 });
    }

    const body = await request.json();
    const { deviceId } = claimSchema.parse(body);

    const claim = await prisma.startbordClaim.upsert({
      where: { clubId_airfield: { clubId, airfield } },
      create: { clubId, airfield, deviceId },
      update: {
        deviceId,
        claimedAt: new Date(),
        // Reset any stale position from a previous claiming tablet
        latitude: null,
        longitude: null,
        heading: null,
        accuracy: null,
        positionUpdatedAt: null
      }
    });

    broadcastToClients({
      type: 'startbord_changed',
      airfield,
      deviceId
    }, airfield);

    return NextResponse.json({
      success: true,
      claim: { deviceId: claim.deviceId, airfield: claim.airfield, claimedAt: claim.claimedAt }
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: error.errors }, { status: 400 });
    }
    console.error('Error claiming startbord:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to claim startbord: ' + error.message },
      { status: 500 }
    );
  }
}
