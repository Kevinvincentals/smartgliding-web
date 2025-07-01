import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const response = NextResponse.json(
      { success: true, message: 'Signed out successfully' },
      { status: 200 }
    )

    // Clear admin authentication cookies
    response.cookies.set('admin-access-token', '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      expires: new Date(0),
      path: '/'
    })

    response.cookies.set('admin-refresh-token', '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      expires: new Date(0),
      path: '/'
    })

    return response

  } catch (error) {
    console.error('Admin signout error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}