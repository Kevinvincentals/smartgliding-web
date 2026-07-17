"use client"

import { useState, useEffect } from "react"
import {
  Truck,
  Plus,
  MoreHorizontal,
  Settings,
  Trash2
} from "lucide-react"
import { toast as hotToast } from 'react-hot-toast'
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
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
import { VehicleEditSheet } from "./vehicle-edit-sheet"
import { AddVehicleSheet } from "./add-vehicle-sheet"
import { VEHICLE_ICONS, type VehicleIconKey } from "@/lib/vehicle-icons"

interface ClubVehicle {
  id: string
  name: string
  icon: string
  ogn_id: string
  createdAt: Date
  updatedAt: Date
}

export function VehicleManagement() {
  const [vehicles, setVehicles] = useState<ClubVehicle[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [selectedVehicle, setSelectedVehicle] = useState<ClubVehicle | null>(null)
  const [isEditSheetOpen, setIsEditSheetOpen] = useState(false)
  const [isAddSheetOpen, setIsAddSheetOpen] = useState(false)

  useEffect(() => {
    fetchVehicles()
  }, [])

  const fetchVehicles = async () => {
    try {
      setIsLoading(true)
      const response = await fetch('/api/club/admin/get_vehicles', {
        credentials: 'include'
      })
      if (!response.ok) {
        throw new Error('Failed to fetch vehicles')
      }
      const data = await response.json()
      if (data.message === 'Vehicles fetched successfully') {
        setVehicles(data.vehicles || [])
      } else {
        throw new Error(data.error || 'Failed to load vehicles')
      }
    } catch (error) {
      console.error('Error fetching vehicles:', error)
      hotToast.error("Kunne ikke hente køretøjer")
    } finally {
      setIsLoading(false)
    }
  }

  const handleEditVehicle = (vehicle: ClubVehicle) => {
    setSelectedVehicle(vehicle)
    setIsEditSheetOpen(true)
  }

  const handleCloseEditSheet = () => {
    setIsEditSheetOpen(false)
    setTimeout(() => setSelectedVehicle(null), 300)
  }

  const handleVehicleUpdated = (updatedVehicle: any) => {
    setVehicles(prev =>
      prev.map(v => v.id === updatedVehicle.id ? { ...v, ...updatedVehicle } : v)
    )
  }

  const handleAddVehicle = (newVehicle: any) => {
    setVehicles(prev => [...prev, newVehicle])
  }

  const handleDeleteVehicle = async (vehicleId: string) => {
    if (!confirm('Er du sikker på at du vil slette dette køretøj?')) {
      return
    }

    try {
      const response = await fetch('/api/club/admin/delete_vehicle', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ vehicleId }),
      })

      if (!response.ok) {
        throw new Error('Failed to delete vehicle')
      }

      const data = await response.json()
      if (data.message === 'Vehicle deleted successfully') {
        hotToast.success("Køretøjet er slettet")
        setVehicles(prev => prev.filter(v => v.id !== vehicleId))
      } else {
        throw new Error(data.error || 'Failed to delete vehicle')
      }
    } catch (error) {
      console.error('Error deleting vehicle:', error)
      hotToast.error("Kunne ikke slette køretøj")
    }
  }

  const renderIcon = (iconKey: string) => {
    const Icon = VEHICLE_ICONS[iconKey as VehicleIconKey] || Truck
    return <Icon className="h-5 w-5" />
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Køretøjer</CardTitle>
          <CardDescription>Administrer klubbens køretøjer med OGN tracker.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
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
              <Truck className="h-5 w-5 mr-2" />
              Køretøjer
            </CardTitle>
            <CardDescription>
              Administrer klubbens køretøjer med OGN tracker, fx spil og wirehenter. De vises på live kortet.
            </CardDescription>
          </div>
          <Button onClick={() => setIsAddSheetOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Tilføj Køretøj
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {vehicles.length === 0 ? (
          <div className="text-center py-8">
            <Truck className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">
              Ingen køretøjer endnu. Tilføj fx klubbens spil eller wirehenter.
            </p>
          </div>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">Ikon</TableHead>
                  <TableHead>Navn</TableHead>
                  <TableHead>OGN ID</TableHead>
                  <TableHead className="text-right">Handlinger</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {vehicles.map((vehicle) => (
                  <TableRow key={vehicle.id}>
                    <TableCell
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => handleEditVehicle(vehicle)}
                    >
                      {renderIcon(vehicle.icon)}
                    </TableCell>
                    <TableCell
                      className="font-medium cursor-pointer hover:bg-muted/50"
                      onClick={() => handleEditVehicle(vehicle)}
                    >
                      {vehicle.name}
                    </TableCell>
                    <TableCell
                      className="cursor-pointer hover:bg-muted/50 font-mono"
                      onClick={() => handleEditVehicle(vehicle)}
                    >
                      {vehicle.ogn_id}
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
                          <DropdownMenuItem onClick={() => handleEditVehicle(vehicle)}>
                            <Settings className="h-4 w-4 mr-2" />
                            Rediger Køretøj
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleDeleteVehicle(vehicle.id)
                            }}
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Slet Køretøj
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
      </CardContent>

      <VehicleEditSheet
        vehicle={selectedVehicle}
        isOpen={isEditSheetOpen}
        onClose={handleCloseEditSheet}
        onUpdate={handleVehicleUpdated}
      />

      <AddVehicleSheet
        isOpen={isAddSheetOpen}
        onClose={() => setIsAddSheetOpen(false)}
        onAdd={handleAddVehicle}
      />
    </Card>
  )
}
