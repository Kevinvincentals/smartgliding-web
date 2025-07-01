"use client"

import { useRouter } from "next/navigation"
import { AdminAuthForm } from "@/components/club-admin/admin-auth-form"

export default function AdminAuthPage() {
  const router = useRouter()

  const handleBack = () => {
    router.back()
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <AdminAuthForm onBack={handleBack} />
    </div>
  )
}