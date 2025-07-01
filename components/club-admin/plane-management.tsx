"use client"

import { useState, useEffect } from "react"
import { 
  Plane, 
  Plus, 
  Search, 
  MoreHorizontal,
  Settings,
  Trash2,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  AlertTriangle
} from "lucide-react"
import { toast as hotToast } from 'react-hot-toast'
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger,
  DropdownMenuSeparator
} from "@/components/ui/dropdown-menu"
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"
import { Checkbox } from "@/components/ui/checkbox"
import { PlaneEditSheet } from "./plane-edit-sheet"
import { AddPlaneSheet } from "./add-plane-sheet"

interface ClubPlane {
  id: string
  registration_id: string
  flarm_id?: string
  competition_id?: string
  type: string
  is_twoseater: boolean
  is_guest: boolean
  flight_time: number
  starts: number
  year_produced?: number
  notes?: string
  flightLogs?: Array<{ takeoff_time: Date | null }>
  createdAt: Date
  updatedAt: Date
}

type SortField = 'registration' | 'type' | 'flarm_id' | 'flight_time' | 'starts' | 'last_flight'
type SortDirection = 'asc' | 'desc'

export function PlaneManagement() {
  const [planes, setPlanes] = useState<ClubPlane[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedPlane, setSelectedPlane] = useState<ClubPlane | null>(null)
  const [isEditSheetOpen, setIsEditSheetOpen] = useState(false)
  const [selectedPlaneIds, setSelectedPlaneIds] = useState<string[]>([])
  const [isAddPlaneSheetOpen, setIsAddPlaneSheetOpen] = useState(false)
  const [sortField, setSortField] = useState<SortField>('last_flight')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')

  useEffect(() => {
    fetchPlanes()
  }, [])

  const fetchPlanes = async () => {
    try {
      setIsLoading(true)
      const response = await fetch('/api/club/admin/get_planes', {
        credentials: 'include'
      })
      if (!response.ok) {
        throw new Error('Failed to fetch planes')
      }
      const data = await response.json()
      if (data.message === 'Planes fetched successfully') {
        setPlanes(data.planes || [])
      } else {
        throw new Error(data.error || 'Failed to load planes')
      }
    } catch (error) {
      console.error('Error fetching planes:', error)
      hotToast.error("Kunne ikke hente fly liste")
    } finally {
      setIsLoading(false)
    }
  }

  const handleEditPlane = (plane: ClubPlane) => {
    setSelectedPlane(plane)
    setIsEditSheetOpen(true)
  }

  const handleCloseEditSheet = () => {
    setIsEditSheetOpen(false)
    setTimeout(() => setSelectedPlane(null), 300)
  }

  const handlePlaneUpdated = (updatedPlane: any) => {
    setPlanes(prevPlanes => 
      prevPlanes.map(p => 
        p.id === updatedPlane.id 
          ? { ...p, ...updatedPlane } 
          : p
      )
    )
  }

  const handleSelectPlane = (planeId: string, checked: boolean) => {
    if (checked) {
      setSelectedPlaneIds(prev => [...prev, planeId])
    } else {
      setSelectedPlaneIds(prev => prev.filter(id => id !== planeId))
    }
  }

  const handleAddPlane = (newPlane: any) => {
    setPlanes(prevPlanes => [...prevPlanes, newPlane])
  }

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('asc')
    }
  }

  const getSortIcon = (field: SortField) => {
    if (sortField !== field) {
      return <ChevronsUpDown className="h-4 w-4" />
    }
    return sortDirection === 'asc' ? 
      <ChevronUp className="h-4 w-4" /> : 
      <ChevronDown className="h-4 w-4" />
  }

  const handleBatchRemove = async () => {
    if (selectedPlaneIds.length === 0) return

    if (!confirm(`Er du sikker på at du vil slette ${selectedPlaneIds.length} fly?`)) {
      return
    }

    try {
      const removePromises = selectedPlaneIds.map(async (planeId) => {
        const response = await fetch('/api/club/admin/delete_plane', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({ planeId }),
        })

        if (!response.ok) {
          throw new Error(`Failed to remove plane ${planeId}`)
        }
      })

      await Promise.all(removePromises)

      hotToast.success(`${selectedPlaneIds.length} fly er slettet`)

      setPlanes(prevPlanes => 
        prevPlanes.filter(p => !selectedPlaneIds.includes(p.id))
      )
      setSelectedPlaneIds([])
    } catch (error) {
      console.error('Error removing planes:', error)
      hotToast.error("Kunne ikke slette alle fly")
    }
  }

  const filteredAndSortedPlanes = planes
    .filter(plane => {
      const searchLower = searchTerm.toLowerCase()
      return (
        plane.registration_id.toLowerCase().includes(searchLower) ||
        plane.type.toLowerCase().includes(searchLower) ||
        (plane.flarm_id && plane.flarm_id.toLowerCase().includes(searchLower)) ||
        (plane.competition_id && plane.competition_id.toLowerCase().includes(searchLower))
      )
    })
    .sort((a, b) => {
      let aValue: string | number = ''
      let bValue: string | number = ''

      switch (sortField) {
        case 'registration':
          aValue = a.registration_id.toLowerCase()
          bValue = b.registration_id.toLowerCase()
          break
        case 'type':
          aValue = a.type.toLowerCase()
          bValue = b.type.toLowerCase()
          break
        case 'flarm_id':
          aValue = a.flarm_id?.toLowerCase() || 'zzz'
          bValue = b.flarm_id?.toLowerCase() || 'zzz'
          break
        case 'flight_time':
          aValue = a.flight_time
          bValue = b.flight_time
          break
        case 'starts':
          aValue = a.starts
          bValue = b.starts
          break
        case 'last_flight':
          const aLastFlight = a.flightLogs?.[0]?.takeoff_time
          const bLastFlight = b.flightLogs?.[0]?.takeoff_time
          if (!aLastFlight && !bLastFlight) return a.registration_id.localeCompare(b.registration_id)
          if (!aLastFlight) return 1
          if (!bLastFlight) return -1
          aValue = new Date(aLastFlight).getTime()
          bValue = new Date(bLastFlight).getTime()
          break
      }

      if (sortDirection === 'asc') {
        return aValue < bValue ? -1 : aValue > bValue ? 1 : 0
      } else {
        return aValue > bValue ? -1 : aValue < bValue ? 1 : 0
      }
    })

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedPlaneIds(filteredAndSortedPlanes.map(p => p.id))
    } else {
      setSelectedPlaneIds([])
    }
  }

  const handleDeletePlane = async (planeId: string) => {
    if (!confirm('Er du sikker på at du vil slette dette fly?')) {
      return
    }

    try {
      const response = await fetch('/api/club/admin/delete_plane', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          planeId: planeId
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to delete plane')
      }

      const data = await response.json()
      if (data.message === 'Plane deleted successfully') {
        hotToast.success("Flyet er slettet")
        setPlanes(prevPlanes => prevPlanes.filter(p => p.id !== planeId))
      } else {
        throw new Error(data.error || 'Failed to delete plane')
      }
    } catch (error) {
      console.error('Error deleting plane:', error)
      hotToast.error("Kunne ikke slette fly")
    }
  }

  const formatFlightTime = (minutes: number) => {
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    return `${hours}:${mins.toString().padStart(2, '0')}`
  }

  const getLastFlightDate = (plane: ClubPlane) => {
    const lastFlight = plane.flightLogs?.[0]?.takeoff_time
    if (!lastFlight) return 'Aldrig'
    return new Date(lastFlight).toLocaleDateString('da-DK')
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Fly Administration</CardTitle>
          <CardDescription>Administrer klub fly, registreringer og oplysninger.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex items-center space-x-4">
                <Skeleton className="h-12 w-12 rounded-full" />
                <div className="space-y-2">
                  <Skeleton className="h-4 w-[200px]" />
                  <Skeleton className="h-4 w-[150px]" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center">
              <Plane className="h-5 w-5 mr-2" />
              Fly Administration
            </CardTitle>
            <CardDescription>
              Administrer klub fly, registreringer og oplysninger. ({filteredAndSortedPlanes.length} af {planes.length})
            </CardDescription>
          </div>
          <Button onClick={() => setIsAddPlaneSheetOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Tilføj Fly
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Search className="h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Søg efter registrering, type eller FLARM ID..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="max-w-sm"
              />
            </div>
            
            {selectedPlaneIds.length > 0 && (
              <div className="flex items-center space-x-2">
                <span className="text-sm text-muted-foreground">
                  {selectedPlaneIds.length} valgt
                </span>
                <Button 
                  size="sm" 
                  variant="destructive" 
                  onClick={handleBatchRemove}
                >
                  <Trash2 className="h-4 w-4 mr-1" />
                  Slet Fly
                </Button>
              </div>
            )}
          </div>

          {filteredAndSortedPlanes.length === 0 ? (
            <div className="text-center py-8">
              <Plane className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">
                {searchTerm ? 'Ingen fly matcher din søgning' : 'Ingen fly fundet'}
              </p>
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">
                      <Checkbox
                        checked={selectedPlaneIds.length === filteredAndSortedPlanes.length && filteredAndSortedPlanes.length > 0}
                        onCheckedChange={handleSelectAll}
                      />
                    </TableHead>
                    <TableHead>
                      <Button 
                        variant="ghost" 
                        className="h-auto p-0 font-semibold hover:bg-transparent"
                        onClick={() => handleSort('registration')}
                      >
                        Registrering
                        {getSortIcon('registration')}
                      </Button>
                    </TableHead>
                    <TableHead>
                      <Button 
                        variant="ghost" 
                        className="h-auto p-0 font-semibold hover:bg-transparent"
                        onClick={() => handleSort('type')}
                      >
                        Type
                        {getSortIcon('type')}
                      </Button>
                    </TableHead>
                    <TableHead>
                      <Button 
                        variant="ghost" 
                        className="h-auto p-0 font-semibold hover:bg-transparent"
                        onClick={() => handleSort('flarm_id')}
                      >
                        FLARM ID
                        {getSortIcon('flarm_id')}
                      </Button>
                    </TableHead>
                    <TableHead>
                      <Button 
                        variant="ghost" 
                        className="h-auto p-0 font-semibold hover:bg-transparent"
                        onClick={() => handleSort('flight_time')}
                      >
                        Flyvetid
                        {getSortIcon('flight_time')}
                      </Button>
                    </TableHead>
                    <TableHead>
                      <Button 
                        variant="ghost" 
                        className="h-auto p-0 font-semibold hover:bg-transparent"
                        onClick={() => handleSort('starts')}
                      >
                        Starter
                        {getSortIcon('starts')}
                      </Button>
                    </TableHead>
                    <TableHead>
                      <Button 
                        variant="ghost" 
                        className="h-auto p-0 font-semibold hover:bg-transparent"
                        onClick={() => handleSort('last_flight')}
                      >
                        Sidst Fløjet
                        {getSortIcon('last_flight')}
                      </Button>
                    </TableHead>
                    <TableHead className="text-right">Handlinger</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAndSortedPlanes.map((plane) => (
                    <TableRow key={plane.id}>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selectedPlaneIds.includes(plane.id)}
                          onCheckedChange={(checked) => handleSelectPlane(plane.id, checked as boolean)}
                        />
                      </TableCell>
                      <TableCell 
                        className="font-medium cursor-pointer hover:bg-muted/50" 
                        onClick={() => handleEditPlane(plane)}
                      >
                        <div className="flex items-center">
                          <span>{plane.registration_id}</span>
                          {plane.is_twoseater && (
                            <Badge variant="secondary" className="ml-2">2-sædet</Badge>
                          )}
                          {plane.is_guest && (
                            <Badge variant="outline" className="ml-2">Gæst</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell 
                        className="cursor-pointer hover:bg-muted/50" 
                        onClick={() => handleEditPlane(plane)}
                      >
                        {plane.type}
                      </TableCell>
                      <TableCell 
                        className="cursor-pointer hover:bg-muted/50" 
                        onClick={() => handleEditPlane(plane)}
                      >
                        <div className="flex items-center">
                          {plane.flarm_id || '-'}
                          {!plane.flarm_id && (
                            <span title="FLARM ID mangler - påkrævet for automatisk start/landing">
                              <AlertTriangle className="h-4 w-4 text-orange-500 ml-2" />
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell 
                        className="cursor-pointer hover:bg-muted/50" 
                        onClick={() => handleEditPlane(plane)}
                      >
                        {formatFlightTime(plane.flight_time)}
                      </TableCell>
                      <TableCell 
                        className="cursor-pointer hover:bg-muted/50" 
                        onClick={() => handleEditPlane(plane)}
                      >
                        {plane.starts}
                      </TableCell>
                      <TableCell 
                        className="cursor-pointer hover:bg-muted/50" 
                        onClick={() => handleEditPlane(plane)}
                      >
                        {getLastFlightDate(plane)}
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button 
                              variant="ghost" 
                              className="h-8 w-8 p-0"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleEditPlane(plane)}>
                              <Settings className="h-4 w-4 mr-2" />
                              Rediger Fly
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem 
                              className="text-destructive"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleDeletePlane(plane.id)
                              }}
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Slet Fly
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </CardContent>

      <PlaneEditSheet
        plane={selectedPlane}
        isOpen={isEditSheetOpen}
        onClose={handleCloseEditSheet}
        onUpdate={handlePlaneUpdated}
      />

      <AddPlaneSheet
        isOpen={isAddPlaneSheetOpen}
        onClose={() => setIsAddPlaneSheetOpen(false)}
        onAdd={handleAddPlane}
      />
    </Card>
  )
}