import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { broadcastToClients } from '@/lib/websocket/utils';
import { JWTPayload } from '@/lib/jwt';
import { z } from 'zod';

const positionSchema = z.object({
  deviceId: z.string().uuid('deviceId must be a UUID'),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  heading: z.number().min(0).max(360).nullable().optional(),
  accuracy: z.number().min(0).optional()
});

// POST handler for the startbord tablet's position beacon. Rejects with 409 if
// the sender no longer holds the claim (another tablet took over), which tells
// the client to stop its beacon.
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
    const data = positionSchema.parse(body);

    const claim = await prisma.startbordClaim.findUnique({
      where: { clubId_airfield: { clubId, airfield } }
    });

    if (!claim || claim.deviceId !== data.deviceId) {
      return NextResponse.json({ success: false, error: 'stale_claim' }, { status: 409 });
    }

    const positionUpdatedAt = new Date();

    await prisma.startbordClaim.update({
      where: { id: claim.id },
      data: {
        latitude: data.latitude,
        longitude: data.longitude,
        heading: data.heading ?? null,
        accuracy: data.accuracy ?? null,
        positionUpdatedAt
      }
    });

    broadcastToClients({
      type: 'startbord_position',
      airfield,
      deviceId: data.deviceId,
      latitude: data.latitude,
      longitude: data.longitude,
      heading: data.heading ?? null,
      accuracy: data.accuracy ?? null,
      timestamp: positionUpdatedAt.toISOString()
    }, airfield);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: error.errors }, { status: 400 });
    }
    console.error('Error updating startbord position:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update startbord position: ' + error.message },
      { status: 500 }
    );
  }
}
