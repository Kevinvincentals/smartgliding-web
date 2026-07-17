import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { JWTPayload } from '@/lib/jwt';

// GET handler to fetch the club's ground vehicles + the distance-widget flag
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const jwtPayloadString = request.headers.get('x-jwt-payload');
    if (!jwtPayloadString) {
      return NextResponse.json({ success: false, error: 'Authentication token not found.' }, { status: 401 });
    }
    const jwtPayload: JWTPayload = JSON.parse(jwtPayloadString);
    const clubId = jwtPayload.clubId || jwtPayload.id;

    if (!clubId) {
      return NextResponse.json({ success: false, error: 'Club ID not found in authentication token.' }, { status: 401 });
    }

    const [vehicles, club] = await Promise.all([
      prisma.groundVehicle.findMany({
        where: { clubId },
        select: { id: true, name: true, icon: true, ogn_id: true },
        orderBy: { name: 'asc' }
      }),
      prisma.club.findUnique({
        where: { id: clubId },
        select: { startbord_show_vehicle_distance: true }
      })
    ]);

    return NextResponse.json({
      success: true,
      vehicles,
      showVehicleDistanceOutsideMap: club?.startbord_show_vehicle_distance ?? false
    });
  } catch (error: any) {
    console.error('Error fetching vehicles:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch vehicles: ' + error.message },
      { status: 500 }
    );
  }
}
