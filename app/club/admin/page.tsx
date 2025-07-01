"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"
import { AdminDashboard } from "@/components/club-admin/admin-dashboard"

interface AdminInfo {
  id: string
  name: string
  email: string
  clubId: string
  clubName: string
}

export default function AdminPage() {
  const router = useRouter()
  const [adminInfo, setAdminInfo] = useState<AdminInfo | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    // Check if user is authenticated as admin
    const checkAuth = async () => {
      try {
        // Try to access a protected admin endpoint to verify authentication
        const response = await fetch('/api/club/admin/me', {
          credentials: 'include'
        })
        
        if (response.ok) {
          const data = await response.json()
          setAdminInfo(data.admin)
        } else {
          // Not authenticated, redirect to auth page
          router.replace('/club/admin/auth')
          return
        }
      } catch (error) {
        console.error('Auth check failed:', error)
        // Redirect to auth page on error
        router.replace('/club/admin/auth')
        return
      } finally {
        setIsLoading(false)
      }
    }

    checkAuth()
  }, [router])

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Verificerer adgang...</p>
        </div>
      </div>
    )
  }

  return <AdminDashboard adminInfo={adminInfo || undefined} />
}