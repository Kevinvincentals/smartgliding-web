"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { 
  Users, 
  Plane, 
  BarChart3, 
  Settings, 
  LogOut, 
  ArrowLeft,
  Shield,
  Clock,
  TrendingUp,
  Timer
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useToast } from "@/components/ui/use-toast"
import { Badge } from "@/components/ui/badge"
import { PilotManagement } from "./pilot-management"
import { PlaneManagement } from "./plane-management"

interface AdminDashboardProps {
  adminInfo?: {
    id: string
    name: string
    email: string
    clubId: string
    clubName: string
  }
}

export function AdminDashboard({ adminInfo }: AdminDashboardProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [activeTab, setActiveTab] = useState("overview")
  const [isSigningOut, setIsSigningOut] = useState(false)
  const [statistics, setStatistics] = useState({
    totalPilots: 0,
    totalFlights: 0,
    totalFlightTime: 0,
    totalStarts: 0
  })
  const [isLoadingStats, setIsLoadingStats] = useState(true)

  // Fetch overview statistics
  useEffect(() => {
    const fetchStatistics = async () => {
      try {
        const response = await fetch('/api/club/admin/overview', {
          credentials: 'include'
        })
        if (response.ok) {
          const data = await response.json()
          if (data.success) {
            setStatistics(data.statistics)
          }
        }
      } catch (error) {
        console.error('Error fetching statistics:', error)
      } finally {
        setIsLoadingStats(false)
      }
    }

    fetchStatistics()
  }, [])

  const handleSignOut = async () => {
    setIsSigningOut(true)
    try {
      // Clear admin cookies by making a request to a signout endpoint
      const response = await fetch('/api/club/admin/auth/signout', {
        method: 'POST',
      })
      
      if (response.ok) {
        toast({
          title: "Logget ud",
          description: "Du er nu logget ud af administratorpanelet",
          variant: "default",
        })
      }
    } catch (error) {
      console.error('Error signing out:', error)
    } finally {
      setIsSigningOut(false)
      // Navigate back to settings regardless of API response
      router.push('/startliste/settings')
    }
  }

  const handleBackToSettings = () => {
    router.push('/startliste/settings')
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={handleBackToSettings}
                className="text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Tilbage til indstillinger
              </Button>
              <div className="h-6 w-px bg-border" />
              <div>
                <h1 className="text-2xl font-bold flex items-center">
                  <Shield className="h-6 w-6 mr-2 text-primary" />
                  Club Admin
                </h1>
                <p className="text-sm text-muted-foreground">
                  {adminInfo?.clubName || 'Loading...'}
                </p>
              </div>
            </div>
            
            <div className="flex items-center space-x-4">
              {adminInfo && (
                <div className="text-right">
                  <p className="text-sm font-medium">{adminInfo.name}</p>
                  <p className="text-xs text-muted-foreground">{adminInfo.email}</p>
                </div>
              )}
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleSignOut}
                disabled={isSigningOut}
              >
                <LogOut className="h-4 w-4 mr-2" />
                {isSigningOut ? "Logger ud..." : "Log ud"}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="overview" className="flex items-center">
              <BarChart3 className="h-4 w-4 mr-2" />
              Oversigt
            </TabsTrigger>
            <TabsTrigger value="pilots" className="flex items-center">
              <Users className="h-4 w-4 mr-2" />
              Piloter
            </TabsTrigger>
            <TabsTrigger value="planes" className="flex items-center">
              <Plane className="h-4 w-4 mr-2" />
              Fly
            </TabsTrigger>
            <TabsTrigger value="settings" className="flex items-center">
              <Settings className="h-4 w-4 mr-2" />
              Indstillinger
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Piloter</CardTitle>
                  <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {isLoadingStats ? '-' : statistics.totalPilots}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {isLoadingStats ? 'Indlæser...' : 'Aktive medlemmer'}
                  </p>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Samlede Flyvninger</CardTitle>
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {isLoadingStats ? '-' : statistics.totalFlights.toLocaleString()}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {isLoadingStats ? 'Indlæser...' : 'Alle registrerede flyvninger'}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Samlet Flyvetid</CardTitle>
                  <Timer className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {isLoadingStats ? '-' : `${Math.round(statistics.totalFlightTime / 60)}t`}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {isLoadingStats ? 'Indlæser...' : 'Timer i luften'}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Samlede Starter</CardTitle>
                  <Plane className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {isLoadingStats ? '-' : statistics.totalStarts.toLocaleString()}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {isLoadingStats ? 'Indlæser...' : 'Takeoffs registreret'}
                  </p>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Velkommen til Club Admin</CardTitle>
                <CardDescription>
                  Administrer din klubs piloter, fly og indstillinger fra dette panel.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center space-x-2">
                    <Badge variant="secondary">
                      <Users className="h-3 w-3 mr-1" />
                      Pilot Administration
                    </Badge>
                    <span className="text-sm text-muted-foreground">
                      Tilføj, rediger og administrer klub medlemmer
                    </span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Badge variant="secondary">
                      <Plane className="h-3 w-3 mr-1" />
                      Fly Administration
                    </Badge>
                    <span className="text-sm text-muted-foreground">
                      Håndter klubbens fly og deres konfiguration
                    </span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Badge variant="secondary">
                      <Settings className="h-3 w-3 mr-1" />
                      Klub Indstillinger
                    </Badge>
                    <span className="text-sm text-muted-foreground">
                      Konfigurer klub specifikke indstillinger og præferencer
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="pilots" className="space-y-6">
            <PilotManagement />
          </TabsContent>

          <TabsContent value="planes" className="space-y-6">
            <PlaneManagement />
          </TabsContent>

          <TabsContent value="settings" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Klub Indstillinger</CardTitle>
                <CardDescription>
                  Konfigurer klub specifikke indstillinger og præferencer.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-center py-8">
                  <Settings className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">
                    Indstillinger funktionalitet kommer snart...
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}