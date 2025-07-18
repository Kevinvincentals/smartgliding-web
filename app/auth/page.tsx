import { prisma } from '@/lib/prisma'
import AuthForm from './components/auth-form'

// Force this page to be dynamically rendered, not statically generated
export const dynamic = 'force-dynamic'

interface Club {
  id: string
  name: string
  homefield: string | null
  allowed_airfields: string[]
}

interface Airfield {
  id: string
  ident: string
  name: string
  icao: string
  type: string
}

async function getClubs(): Promise<Club[]> {
  try {
    const clubs = await prisma.club.findMany({
      select: {
        id: true,
        name: true,
        homefield: true,
        allowed_airfields: true
      },
      orderBy: {
        name: 'asc'
      }
    })
    
    return clubs
  } catch (error) {
    console.error('Error fetching clubs:', error)
    return []
  }
}

async function getAirfields(): Promise<Airfield[]> {
  try {
    const airfields = await prisma.dkAirfields.findMany({
      select: {
        id: true,
        ident: true,
        name: true,
        icao: true,
        type: true
      },
      orderBy: {
        name: 'asc'
      }
    })
    
    return airfields
  } catch (error) {
    console.error('Error fetching airfields:', error)
    return []
  }
}

export default async function AuthPage() {
  const [clubs, airfields] = await Promise.all([getClubs(), getAirfields()])
  return <AuthForm clubs={clubs} airfields={airfields} />
}
