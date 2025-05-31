import { prisma } from '@/lib/prisma'
import AuthForm from './components/auth-form'

// Force this page to be dynamically rendered, not statically generated
export const dynamic = 'force-dynamic'

interface Club {
  id: string
  name: string
  homefield: string | null
}

async function getClubs(): Promise<Club[]> {
  try {
    const clubs = await prisma.club.findMany({
      select: {
        id: true,
        name: true,
        homefield: true
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

export default async function AuthPage() {
  const clubs = await getClubs()
  return <AuthForm clubs={clubs} />
}
