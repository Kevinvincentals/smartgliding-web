import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { broadcastToClients } from '@/lib/websocket/utils';
import { JWTPayload } from '@/lib/jwt';
import { z } from 'zod';

const releaseSchema = z.object({
  deviceId: z.string().uuid('deviceId must be a UUID'),
  // Force-release lets ANY tablet clear the claim (e.g. the startbord iPad is
  // dead or gone) so no tablet is startbord
  force: z.boolean().optional()
});

// POST handler to release the startbord role. The claiming device can always
// release; other devices can release with force: true.
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
    const { deviceId, force } = releaseSchema.parse(body);

    const claim = await prisma.startbordClaim.findUnique({
      where: { clubId_airfield: { clubId, airfield } }
    });

    if (!claim) {
      return NextResponse.json({ success: true, released: false });
    }

    if (claim.deviceId !== deviceId && !force) {
      // Another tablet holds the claim; nothing to release for this device
      return NextResponse.json({ success: true, released: false });
    }

    await prisma.startbordClaim.delete({
      where: { id: claim.id }
    });

    broadcastToClients({
      type: 'startbord_removed',
      airfield
    }, airfield);

    return NextResponse.json({ success: true, released: true });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: error.errors }, { status: 400 });
    }
    console.error('Error releasing startbord:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to release startbord: ' + error.message },
      { status: 500 }
    );
  }
}
