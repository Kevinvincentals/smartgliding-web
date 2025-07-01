import { NextResponse } from 'next/server'
import { verifyToken } from '@/lib/jwt'

export async function GET(request: Request) {
  try {
    // Get admin access token from cookies
    const cookies = request.headers.get('cookie') || ''
    const adminTokenMatch = cookies.match(/admin-access-token=([^;]+)/)
    const adminToken = adminTokenMatch ? adminTokenMatch[1] : null

    if (!adminToken) {
      return NextResponse.json(
        { error: 'No admin authentication found' },
        { status: 401 }
      )
    }

    // Verify the admin token
    const payload = await verifyToken(adminToken)

    // Check if this is an admin token with admin context
    if (!payload.adminContext || payload.adminContext.sessionType !== 'club_admin') {
      return NextResponse.json(
        { error: 'Invalid admin session' },
        { status: 403 }
      )
    }

    // Return admin information
    return NextResponse.json(
      {
        success: true,
        admin: {
          id: payload.adminContext.pilotId,
          name: payload.adminContext.pilotName,
          email: payload.email,
          clubId: payload.adminContext.clubId,
          clubName: payload.adminContext.clubName
        }
      },
      { status: 200 }
    )

  } catch (error) {
    console.error('Admin me endpoint error:', error)
    return NextResponse.json(
      { error: 'Invalid or expired admin session' },
      { status: 401 }
    )
  }
}