import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { JWTPayload } from '@/lib/jwt';

// GET handler to fetch the current startbord claim (incl. last known position)
// for the tablet's club + airfield
export async function GET(request: NextRequest): Promise<NextResponse> {
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

    const claim = await prisma.startbordClaim.findUnique({
      where: { clubId_airfield: { clubId, airfield } }
    });

    return NextResponse.json({
      success: true,
      claim: claim
        ? {
            deviceId: claim.deviceId,
            airfield: claim.airfield,
            claimedAt: claim.claimedAt,
            latitude: claim.latitude,
            longitude: claim.longitude,
            heading: claim.heading,
            accuracy: claim.accuracy,
            positionUpdatedAt: claim.positionUpdatedAt
          }
        : null
    });
  } catch (error: any) {
    console.error('Error fetching startbord claim:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch startbord claim: ' + error.message },
      { status: 500 }
    );
  }
}
