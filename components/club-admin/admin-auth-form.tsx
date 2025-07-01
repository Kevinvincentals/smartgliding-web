"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, Loader2, ShieldCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/components/ui/use-toast"

interface AdminUser {
  id: string
  name: string
  email: string
  hasPin: boolean
}

interface AdminAuthFormProps {
  onBack: () => void
}

export function AdminAuthForm({ onBack }: AdminAuthFormProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [admins, setAdmins] = useState<AdminUser[]>([])
  const [selectedAdminId, setSelectedAdminId] = useState("")
  const [pin, setPin] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingAdmins, setIsLoadingAdmins] = useState(true)
  const [clubName, setClubName] = useState("")

  // Fetch admin users for the current club
  useEffect(() => {
    const fetchAdmins = async () => {
      try {
        const response = await fetch('/api/club/admin/auth/get-admins')
        if (!response.ok) {
          throw new Error('Failed to fetch admin users')
        }
        const data = await response.json()
        if (data.success) {
          setAdmins(data.admins)
          setClubName(data.clubName)
        } else {
          throw new Error(data.error || 'Failed to load admin users')
        }
      } catch (error) {
        console.error('Error fetching admins:', error)
        toast({
          title: "Fejl",
          description: "Kunne ikke hente administrator liste",
          variant: "destructive",
        })
      } finally {
        setIsLoadingAdmins(false)
      }
    }

    fetchAdmins()
  }, [toast])

  const selectedAdmin = admins.find(admin => admin.id === selectedAdminId)

  const handlePinChange = (value: string) => {
    // Only allow digits and limit to 4 characters
    const numericValue = value.replace(/\D/g, '').slice(0, 4)
    setPin(numericValue)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!selectedAdminId) {
      toast({
        title: "Vælg administrator",
        description: "Du skal vælge en administrator fra listen",
        variant: "destructive",
      })
      return
    }

    if (pin.length !== 4) {
      toast({
        title: "Ugyldig PIN",
        description: "PIN skal være 4 cifre",
        variant: "destructive",
      })
      return
    }

    if (!selectedAdmin?.hasPin) {
      toast({
        title: "PIN ikke sat",
        description: "Denne bruger har ikke sat en PIN. Kontakt en administrator.",
        variant: "destructive",
      })
      return
    }

    setIsLoading(true)
    try {
      const response = await fetch('/api/club/admin/auth/signin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          pilotId: selectedAdminId,
          pin: pin
        }),
      })

      const data = await response.json()

      if (response.ok && data.success) {
        toast({
          title: "Login vellykket",
          description: `Velkommen, ${data.admin.name}`,
          variant: "default",
        })
        // Redirect to admin dashboard
        router.push('/club/admin')
      } else {
        throw new Error(data.error || 'Login failed')
      }
    } catch (error: any) {
      console.error('Admin signin error:', error)
      toast({
        title: "Login fejlede",
        description: error.message || "Kunne ikke logge ind. Kontroller din PIN.",
        variant: "destructive",
      })
      setPin("") // Clear PIN on error
    } finally {
      setIsLoading(false)
    }
  }

  if (isLoadingAdmins) {
    return (
      <Card className="w-full max-w-md mx-auto">
        <CardContent className="flex items-center justify-center p-8">
          <Loader2 className="h-6 w-6 animate-spin mr-2" />
          <span>Henter administratorer...</span>
        </CardContent>
      </Card>
    )
  }

  if (admins.length === 0) {
    return (
      <Card className="w-full max-w-md mx-auto">
        <CardHeader>
          <CardTitle className="flex items-center">
            <ShieldCheck className="h-5 w-5 mr-2" />
            Administrator Login
          </CardTitle>
          <CardDescription>
            {clubName && `${clubName} - `}Ingen administratorer fundet
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Der er ingen aktive administratorer for denne klub. Kontakt systemadministratoren.
          </p>
          <Button 
            type="button" 
            variant="outline" 
            onClick={onBack}
            className="w-full"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Tilbage
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center">
          <ShieldCheck className="h-5 w-5 mr-2" />
          Administrator Login
        </CardTitle>
        <CardDescription>
          {clubName && `${clubName} - `}Vælg administrator og indtast PIN
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="admin-select">Administrator</Label>
            <Select value={selectedAdminId} onValueChange={setSelectedAdminId}>
              <SelectTrigger>
                <SelectValue placeholder="Vælg administrator..." />
              </SelectTrigger>
              <SelectContent>
                {admins.map((admin) => (
                  <SelectItem key={admin.id} value={admin.id}>
                    <div className="flex items-center justify-between w-full">
                      <span>{admin.name}</span>
                      {!admin.hasPin && (
                        <span className="text-xs text-muted-foreground ml-2">(Ingen PIN)</span>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedAdminId && (
            <div className="space-y-2">
              <Label htmlFor="pin">PIN (4 cifre)</Label>
              <input
                id="pin"
                type="password"
                value={pin}
                onChange={(e) => handlePinChange(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 text-center text-2xl tracking-widest"
                placeholder="••••"
                maxLength={4}
                disabled={isLoading || !selectedAdmin?.hasPin}
              />
              {selectedAdmin && !selectedAdmin.hasPin && (
                <p className="text-xs text-muted-foreground">
                  Denne administrator har ikke sat en PIN. Kontakt en systemadministrator.
                </p>
              )}
            </div>
          )}

          <div className="flex gap-2">
            <Button 
              type="button" 
              variant="outline" 
              onClick={onBack}
              className="flex-1"
              disabled={isLoading}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Tilbage
            </Button>
            <Button 
              type="submit" 
              className="flex-1" 
              disabled={isLoading || !selectedAdminId || pin.length !== 4 || !selectedAdmin?.hasPin}
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Logger ind...
                </>
              ) : (
                <>
                  <ShieldCheck className="h-4 w-4 mr-2" />
                  Log ind
                </>
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}