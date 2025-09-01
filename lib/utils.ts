import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { prisma } from '@/lib/prisma'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export async function cleanupOldGuestPlanes(clubId?: string) {
  try {
    const fiveDaysAgo = new Date()
    fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5)

    const whereClause = {
      is_guest: true,
      createdAt: {
        lt: fiveDaysAgo
      },
      ...(clubId && { clubId })
    }

    const deletedPlanes = await prisma.plane.deleteMany({
      where: whereClause
    })

    console.log(`Cleaned up ${deletedPlanes.count} guest planes older than 5 days${clubId ? ` for club ${clubId}` : ''}`)
    return deletedPlanes.count
  } catch (error) {
    console.error('Error cleaning up guest planes:', error)
    return 0
  }
}
