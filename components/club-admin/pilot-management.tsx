"use client"

import { useState, useEffect } from "react"
import { 
  Users, 
  UserPlus, 
  Search, 
  MoreHorizontal,
  Mail,
  Phone,
  Shield,
  User,
  Settings,
  Trash2,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown
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
import { useToast } from "@/components/ui/use-toast"
import { Skeleton } from "@/components/ui/skeleton"
import { Checkbox } from "@/components/ui/checkbox"
import { PilotEditSheet } from "./pilot-edit-sheet"
import { AddPilotSheet } from "./add-pilot-sheet"
import { BatchMembershipDialog } from "./batch-membership-dialog"

interface ClubPilot {
  id: string
  role: 'ADMIN' | 'USER'
  pilot: {
    id: string
    firstname: string
    lastname: string
    email: string
    phone?: string
    dsvu_id?: string
    status: 'ACTIVE' | 'INACTIVE' | 'PENDING'
    membership: 'A' | 'B' | 'C' | 'BASIC' | 'PREMIUM' | 'VIP'
  }
}

type SortField = 'name' | 'email' | 'status' | 'role' | 'membership' | 'dsvu_id'
type SortDirection = 'asc' | 'desc'

export function PilotManagement() {
  const { toast } = useToast()
  const [pilots, setPilots] = useState<ClubPilot[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedPilot, setSelectedPilot] = useState<ClubPilot | null>(null)
  const [isEditSheetOpen, setIsEditSheetOpen] = useState(false)
  const [selectedPilotIds, setSelectedPilotIds] = useState<string[]>([])
  const [isAddPilotSheetOpen, setIsAddPilotSheetOpen] = useState(false)
  const [isBatchMembershipOpen, setIsBatchMembershipOpen] = useState(false)
  const [sortField, setSortField] = useState<SortField>('name')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')

  useEffect(() => {
    fetchPilots()
  }, [])

  const fetchPilots = async () => {
    try {
      setIsLoading(true)
      const response = await fetch('/api/club/admin/get_pilots', {
        credentials: 'include' // Include admin cookies
      })
      if (!response.ok) {
        throw new Error('Failed to fetch pilots')
      }
      const data = await response.json()
      if (data.message === 'Pilots fetched successfully') {
        setPilots(data.clubPilots || [])
      } else {
        throw new Error(data.error || 'Failed to load pilots')
      }
    } catch (error) {
      console.error('Error fetching pilots:', error)
      hotToast.error("Kunne ikke hente pilot liste")
    } finally {
      setIsLoading(false)
    }
  }

  const handleEditPilot = (pilot: ClubPilot) => {
    setSelectedPilot(pilot)
    setIsEditSheetOpen(true)
  }

  const handleCloseEditSheet = () => {
    setIsEditSheetOpen(false)
    // Don't set selectedPilot to null immediately to prevent flash
    setTimeout(() => setSelectedPilot(null), 300)
  }

  const handlePilotUpdated = (updatedPilot: any) => {
    // Update specific pilot in the list without full refresh
    setPilots(prevPilots => 
      prevPilots.map(p => 
        p.pilot.id === updatedPilot.id 
          ? { ...p, pilot: updatedPilot } 
          : p
      )
    )
  }

  const handleSelectPilot = (pilotId: string, checked: boolean) => {
    if (checked) {
      setSelectedPilotIds(prev => [...prev, pilotId])
    } else {
      setSelectedPilotIds(prev => prev.filter(id => id !== pilotId))
    }
  }


  const handleAddPilot = (newPilot: any) => {
    // Add new pilot to the list without full refresh
    setPilots(prevPilots => [...prevPilots, newPilot])
  }

  const handleBatchMembershipUpdate = (updatedPilots: any[]) => {
    // Update the pilots list with new membership data
    setPilots(updatedPilots)
    // Clear selection after batch update
    setSelectedPilotIds([])
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
    if (selectedPilotIds.length === 0) return

    if (!confirm(`Er du sikker på at du vil fjerne ${selectedPilotIds.length} pilot(er) fra klubben?`)) {
      return
    }

    try {
      // Remove each selected pilot
      const removePromises = selectedPilotIds.map(async (pilotId) => {
        const response = await fetch('/api/club/admin/unassign_pilot', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({ pilotId }),
        })

        if (!response.ok) {
          throw new Error(`Failed to remove pilot ${pilotId}`)
        }
      })

      await Promise.all(removePromises)

      hotToast.success(`${selectedPilotIds.length} pilot(er) er fjernet fra klubben`)

      // Remove pilots from list
      setPilots(prevPilots => 
        prevPilots.filter(p => !selectedPilotIds.includes(p.pilot.id))
      )
      setSelectedPilotIds([])
    } catch (error) {
      console.error('Error removing pilots:', error)
      hotToast.error("Kunne ikke fjerne alle piloter")
    }
  }

  const filteredAndSortedPilots = pilots
    .filter(clubPilot => {
      const pilot = clubPilot.pilot
      const searchLower = searchTerm.toLowerCase()
      return (
        pilot.firstname.toLowerCase().includes(searchLower) ||
        pilot.lastname.toLowerCase().includes(searchLower) ||
        (pilot.email && pilot.email.toLowerCase().includes(searchLower)) ||
        (pilot.dsvu_id && pilot.dsvu_id.toLowerCase().includes(searchLower))
      )
    })
    .sort((a, b) => {
      let aValue: string | number = ''
      let bValue: string | number = ''

      switch (sortField) {
        case 'name':
          aValue = `${a.pilot.firstname} ${a.pilot.lastname}`.toLowerCase()
          bValue = `${b.pilot.firstname} ${b.pilot.lastname}`.toLowerCase()
          break
        case 'email':
          aValue = (a.pilot.email && !a.pilot.email.includes('@placeholder.local')) ? a.pilot.email.toLowerCase() : 'zzz'
          bValue = (b.pilot.email && !b.pilot.email.includes('@placeholder.local')) ? b.pilot.email.toLowerCase() : 'zzz'
          break
        case 'status':
          aValue = a.pilot.status.toLowerCase()
          bValue = b.pilot.status.toLowerCase()
          break
        case 'role':
          aValue = a.role.toLowerCase()
          bValue = b.role.toLowerCase()
          break
        case 'membership':
          aValue = a.pilot.membership.toLowerCase()
          bValue = b.pilot.membership.toLowerCase()
          break
        case 'dsvu_id':
          aValue = a.pilot.dsvu_id?.toLowerCase() || 'zzz'
          bValue = b.pilot.dsvu_id?.toLowerCase() || 'zzz'
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
      setSelectedPilotIds(filteredAndSortedPilots.map(p => p.pilot.id))
    } else {
      setSelectedPilotIds([])
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return <Badge variant="default">Aktiv</Badge>
      case 'INACTIVE':
        return <Badge variant="secondary">Inaktiv</Badge>
      case 'PENDING':
        return <Badge variant="outline">Afventer</Badge>
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'ADMIN':
        return <Badge variant="destructive"><Shield className="h-3 w-3 mr-1" />Admin</Badge>
      case 'USER':
        return <Badge variant="outline"><User className="h-3 w-3 mr-1" />Medlem</Badge>
      default:
        return <Badge variant="outline">{role}</Badge>
    }
  }

  const getMembershipBadge = (membership: string) => {
    switch (membership) {
      case 'A':
        return <Badge variant="default">A</Badge>
      case 'B':
        return <Badge variant="secondary">B</Badge>
      case 'C':
        return <Badge variant="outline">C</Badge>
      case 'BASIC':
        return <Badge variant="outline">Basic (Legacy)</Badge>
      case 'PREMIUM':
        return <Badge variant="secondary">Premium (Legacy)</Badge>
      case 'VIP':
        return <Badge variant="default">VIP (Legacy)</Badge>
      default:
        return <Badge variant="outline">{membership}</Badge>
    }
  }

  const handleUpdateRole = async (pilotId: string, newRole: 'ADMIN' | 'USER') => {
    try {
      const response = await fetch('/api/club/admin/update_role', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          pilotId: pilotId,
          role: newRole
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to update role')
      }

      const data = await response.json()
      if (data.message === 'Role updated successfully') {
        hotToast.success(`Pilotens rolle er ændret til ${newRole === 'ADMIN' ? 'Administrator' : 'Medlem'}`)
        fetchPilots() // Refresh the list
      } else {
        throw new Error(data.error || 'Failed to update role')
      }
    } catch (error) {
      console.error('Error updating role:', error)
      hotToast.error("Kunne ikke opdatere rolle")
    }
  }

  const handleUnassignPilot = async (pilotId: string) => {
    try {
      const response = await fetch('/api/club/admin/unassign_pilot', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          pilotId: pilotId
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to unassign pilot')
      }

      const data = await response.json()
      if (data.message === 'Pilot unassigned from club successfully') {
        hotToast.success("Piloten er fjernet fra klubben")
        // Remove pilot from list without full refresh
        setPilots(prevPilots => prevPilots.filter(p => p.pilot.id !== pilotId))
      } else {
        throw new Error(data.error || 'Failed to unassign pilot')
      }
    } catch (error) {
      console.error('Error unassigning pilot:', error)
      hotToast.error("Kunne ikke fjerne pilot fra klubben")
    }
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Pilot Administration</CardTitle>
          <CardDescription>Administrer klub medlemmer, roller og tilladelser.</CardDescription>
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
              <Users className="h-5 w-5 mr-2" />
              Pilot Administration
            </CardTitle>
            <CardDescription>
              Administrer klub medlemmer, roller og tilladelser. ({filteredAndSortedPilots.length} af {pilots.length})
            </CardDescription>
          </div>
          <Button onClick={() => setIsAddPilotSheetOpen(true)}>
            <UserPlus className="h-4 w-4 mr-2" />
            Tilføj Pilot
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Search className="h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Søg efter navn, email eller DSVU ID..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="max-w-sm"
              />
            </div>
            
            {selectedPilotIds.length > 0 && (
              <div className="flex items-center space-x-2">
                <span className="text-sm text-muted-foreground">
                  {selectedPilotIds.length} valgt
                </span>
                <Button 
                  size="sm" 
                  variant="outline" 
                  onClick={() => setIsBatchMembershipOpen(true)}
                >
                  Batch Medlemskab
                </Button>
                <Button 
                  size="sm" 
                  variant="destructive" 
                  onClick={handleBatchRemove}
                >
                  <Trash2 className="h-4 w-4 mr-1" />
                  Fjern Fra Klub
                </Button>
              </div>
            )}
          </div>

          {filteredAndSortedPilots.length === 0 ? (
            <div className="text-center py-8">
              <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">
                {searchTerm ? 'Ingen piloter matcher din søgning' : 'Ingen piloter fundet'}
              </p>
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">
                      <Checkbox
                        checked={selectedPilotIds.length === filteredAndSortedPilots.length && filteredAndSortedPilots.length > 0}
                        onCheckedChange={handleSelectAll}
                      />
                    </TableHead>
                    <TableHead>
                      <Button 
                        variant="ghost" 
                        className="h-auto p-0 font-semibold hover:bg-transparent"
                        onClick={() => handleSort('name')}
                      >
                        Pilot
                        {getSortIcon('name')}
                      </Button>
                    </TableHead>
                    <TableHead>
                      <Button 
                        variant="ghost" 
                        className="h-auto p-0 font-semibold hover:bg-transparent"
                        onClick={() => handleSort('email')}
                      >
                        Kontakt
                        {getSortIcon('email')}
                      </Button>
                    </TableHead>
                    <TableHead>
                      <Button 
                        variant="ghost" 
                        className="h-auto p-0 font-semibold hover:bg-transparent"
                        onClick={() => handleSort('status')}
                      >
                        Status
                        {getSortIcon('status')}
                      </Button>
                    </TableHead>
                    <TableHead>
                      <Button 
                        variant="ghost" 
                        className="h-auto p-0 font-semibold hover:bg-transparent"
                        onClick={() => handleSort('role')}
                      >
                        Rolle
                        {getSortIcon('role')}
                      </Button>
                    </TableHead>
                    <TableHead>
                      <Button 
                        variant="ghost" 
                        className="h-auto p-0 font-semibold hover:bg-transparent"
                        onClick={() => handleSort('membership')}
                      >
                        Medlemskab
                        {getSortIcon('membership')}
                      </Button>
                    </TableHead>
                    <TableHead>
                      <Button 
                        variant="ghost" 
                        className="h-auto p-0 font-semibold hover:bg-transparent"
                        onClick={() => handleSort('dsvu_id')}
                      >
                        DSVU ID
                        {getSortIcon('dsvu_id')}
                      </Button>
                    </TableHead>
                    <TableHead className="text-right">Handlinger</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAndSortedPilots.map((clubPilot) => (
                    <TableRow key={clubPilot.id}>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selectedPilotIds.includes(clubPilot.pilot.id)}
                          onCheckedChange={(checked) => handleSelectPilot(clubPilot.pilot.id, checked as boolean)}
                        />
                      </TableCell>
                      <TableCell 
                        className="font-medium cursor-pointer hover:bg-muted/50" 
                        onClick={() => handleEditPilot(clubPilot)}
                      >
                        <div>
                          <p className="font-medium">
                            {clubPilot.pilot.firstname} {clubPilot.pilot.lastname}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {clubPilot.pilot.email && !clubPilot.pilot.email.includes('@placeholder.local') ? clubPilot.pilot.email : 'Ingen email'}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell 
                        className="cursor-pointer hover:bg-muted/50" 
                        onClick={() => handleEditPilot(clubPilot)}
                      >
                        <div className="space-y-1">
                          <div className="flex items-center text-sm">
                            <Mail className="h-3 w-3 mr-1" />
                            {clubPilot.pilot.email && !clubPilot.pilot.email.includes('@placeholder.local') ? clubPilot.pilot.email : 'Ingen email'}
                          </div>
                          {clubPilot.pilot.phone && (
                            <div className="flex items-center text-sm text-muted-foreground">
                              <Phone className="h-3 w-3 mr-1" />
                              {clubPilot.pilot.phone}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell 
                        className="cursor-pointer hover:bg-muted/50" 
                        onClick={() => handleEditPilot(clubPilot)}
                      >
                        {getStatusBadge(clubPilot.pilot.status)}
                      </TableCell>
                      <TableCell 
                        className="cursor-pointer hover:bg-muted/50" 
                        onClick={() => handleEditPilot(clubPilot)}
                      >
                        {getRoleBadge(clubPilot.role)}
                      </TableCell>
                      <TableCell 
                        className="cursor-pointer hover:bg-muted/50" 
                        onClick={() => handleEditPilot(clubPilot)}
                      >
                        {getMembershipBadge(clubPilot.pilot.membership)}
                      </TableCell>
                      <TableCell 
                        className="cursor-pointer hover:bg-muted/50" 
                        onClick={() => handleEditPilot(clubPilot)}
                      >
                        {clubPilot.pilot.dsvu_id || '-'}
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button 
                              variant="ghost" 
                              className="h-8 w-8 p-0"
                              onClick={(e) => e.stopPropagation()} // Prevent row click
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleEditPilot(clubPilot)}>
                              <Settings className="h-4 w-4 mr-2" />
                              Rediger Pilot
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            {clubPilot.role === 'USER' ? (
                              <DropdownMenuItem 
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleUpdateRole(clubPilot.pilot.id, 'ADMIN')
                                }}
                              >
                                <Shield className="h-4 w-4 mr-2" />
                                Gør til Admin
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem 
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleUpdateRole(clubPilot.pilot.id, 'USER')
                                }}
                              >
                                <User className="h-4 w-4 mr-2" />
                                Fjern Admin Rolle
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem 
                              className="text-destructive"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleUnassignPilot(clubPilot.pilot.id)
                              }}
                            >
                              <Users className="h-4 w-4 mr-2" />
                              Fjern fra Klub
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

      <PilotEditSheet
        pilot={selectedPilot}
        isOpen={isEditSheetOpen}
        onClose={handleCloseEditSheet}
        onUpdate={handlePilotUpdated}
      />

      <AddPilotSheet
        isOpen={isAddPilotSheetOpen}
        onClose={() => setIsAddPilotSheetOpen(false)}
        onAdd={handleAddPilot}
      />

      <BatchMembershipDialog
        isOpen={isBatchMembershipOpen}
        onClose={() => setIsBatchMembershipOpen(false)}
        selectedPilotIds={selectedPilotIds}
        pilots={pilots}
        onUpdate={handleBatchMembershipUpdate}
      />
    </Card>
  )
}