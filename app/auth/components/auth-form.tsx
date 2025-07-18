"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { X, Delete, ChevronsUpDown, Check } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

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

interface AuthFormProps {
  clubs: Club[]
  airfields: Airfield[]
}

const LAST_SELECTED_CLUB_ID_KEY = 'lastSelectedClubId'
const LAST_SELECTED_AIRFIELD_KEY = 'lastSelectedAirfield'

export default function AuthForm({ clubs, airfields }: AuthFormProps) {
  const router = useRouter()
  const [pin, setPin] = useState<string[]>([])
  const [error, setError] = useState<string>("")
  const [shake, setShake] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [selectedClub, setSelectedClub] = useState<Club | null>(null)
  const [selectedAirfield, setSelectedAirfield] = useState<Airfield | null>(null)
  const [openClubSelector, setOpenClubSelector] = useState(false)
  const [openAirfieldSelector, setOpenAirfieldSelector] = useState(false)

  // Set last selected club and airfield from localStorage on mount
  useEffect(() => {
    const lastClubId = localStorage.getItem(LAST_SELECTED_CLUB_ID_KEY)
    const lastAirfieldIdent = localStorage.getItem(LAST_SELECTED_AIRFIELD_KEY)
    
    if (lastClubId && clubs.length > 0) {
      const foundClub = clubs.find(club => club.id === lastClubId)
      if (foundClub) {
        setSelectedClub(foundClub)
        console.log("Restored last selected club:", foundClub.name)
        
        // Try to restore last selected airfield
        if (lastAirfieldIdent && airfields.length > 0) {
          const foundAirfield = airfields.find(airfield => airfield.icao === lastAirfieldIdent)
          if (foundAirfield) {
            setSelectedAirfield(foundAirfield)
            console.log("Restored last selected airfield:", foundAirfield.name)
          }
        }
      }
    }
  }, [clubs, airfields])

  // Get all available airfields (no filtering by club)
  const getAvailableAirfields = (): Airfield[] => {
    return airfields
  }

  const handleKeyPress = (key: string) => {
    if (pin.length < 4 && !isLoading) {
      setError("")
      setPin((prev) => [...prev, key])
    }
  }

  const handleDelete = () => {
    if (isLoading) return
    setPin((prev) => prev.slice(0, -1))
    setError("")
  }

  const handleClear = () => {
    if (isLoading) return
    setPin([])
    setError("")
  }

  const handleSubmit = async () => {
    if (!selectedClub || !selectedAirfield || pin.length !== 4 || isLoading) return

    setIsLoading(true)
    setError("")
    const enteredPin = pin.join("")

    try {
      const response = await fetch("/api/tablet/auth/signin", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ 
          clubId: selectedClub.id, 
          pin: enteredPin,
          selectedAirfield: selectedAirfield.icao
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        setError(result.error || "Ugyldig klub eller pinkode.")
        setShake(true)
        setTimeout(() => {
          setPin([])
          setShake(false)
        }, 700)
      } else {
        if (result.success) {
          console.log("Authentication successful. Tokens set as HttpOnly cookies by the server.")
          console.log("Navigating to home page. Club ID:", result.clubId, "Homefield:", result.homefield)
          router.push("/startliste")
        } else {
          setError(result.error || "Login status kunne ikke bekræftes. Prøv igen.")
          setShake(true)
          setTimeout(() => {
            setPin([])
            setShake(false)
          }, 700)
        }
      }
    } catch (err) {
      setError("Der opstod en uventet fejl. Prøv venligst igen.")
      setShake(true)
      setTimeout(() => {
        setPin([])
        setShake(false)
      }, 700)
    }
    setIsLoading(false)
  }

  // Auto-submit when PIN is complete
  useEffect(() => {
    if (pin.length === 4 && selectedClub && selectedAirfield) {
      const timer = setTimeout(() => {
        handleSubmit()
      }, 300)
      return () => clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin, selectedClub, selectedAirfield])

  // Show error if no clubs were loaded
  if (clubs.length === 0) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-100 p-4">
        <div className="w-full max-w-lg bg-white rounded-xl shadow-2xl p-6 text-center">
          <div className="text-red-500 text-lg font-medium">
            Kunne ikke indlæse klubber. Prøv at genindlæse siden.
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-100 p-4 sm:p-6 md:p-8">
      <div className="w-full max-w-lg bg-white rounded-xl shadow-2xl overflow-hidden">
        <div className="p-4 sm:p-6 md:p-6">
          {/* Club Selector */}
          <div className="mb-6">
            <Popover open={openClubSelector} onOpenChange={setOpenClubSelector}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={openClubSelector}
                  className="w-full justify-between h-14 text-lg sm:text-xl"
                  disabled={isLoading}
                >
                  {selectedClub ? selectedClub.name : "Vælg klub..."}
                  <ChevronsUpDown className="ml-3 h-5 w-5 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                <Command>
                  <CommandInput placeholder="Søg efter klub..." className="h-12 text-base sm:text-lg" />
                  <CommandList>
                    <CommandEmpty className="py-6 text-center text-base sm:text-lg">
                      Ingen klubber fundet.
                    </CommandEmpty>
                    <CommandGroup>
                      {clubs.map((club) => (
                        <CommandItem
                          key={club.id}
                          value={club.name}
                          onSelect={() => {
                            setSelectedClub(club)
                            setOpenClubSelector(false)
                            setPin([])
                            setError("")
                            localStorage.setItem(LAST_SELECTED_CLUB_ID_KEY, club.id)
                            console.log("Saved last selected club:", club.name)
                            
                            // Auto-select club's homefield if available
                            if (club.homefield) {
                              const homefieldAirfield = airfields.find(airfield => airfield.icao === club.homefield)
                              if (homefieldAirfield) {
                                setSelectedAirfield(homefieldAirfield)
                                localStorage.setItem(LAST_SELECTED_AIRFIELD_KEY, homefieldAirfield.icao)
                                console.log("Auto-selected club homefield:", homefieldAirfield.name)
                              } else {
                                setSelectedAirfield(null) // Reset if homefield not found
                              }
                            } else {
                              setSelectedAirfield(null) // Reset if no homefield defined
                            }
                          }}
                          className="text-base sm:text-lg py-3"
                        >
                          <Check
                            className={cn(
                              "mr-3 h-5 w-5",
                              selectedClub?.id === club.id ? "opacity-100" : "opacity-0"
                            )}
                          />
                          {club.name}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          {/* Airfield Selector */}
          {selectedClub && (
            <div className="mb-6">
              <Popover open={openAirfieldSelector} onOpenChange={setOpenAirfieldSelector}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={openAirfieldSelector}
                    className="w-full justify-between h-14 text-lg sm:text-xl"
                    disabled={isLoading}
                  >
                    {selectedAirfield ? `${selectedAirfield.name} (${selectedAirfield.icao})` : "Vælg flyveplads..."}
                    <ChevronsUpDown className="ml-3 h-5 w-5 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                  <Command>
                    <CommandInput placeholder="Søg efter flyveplads..." className="h-12 text-base sm:text-lg" />
                    <CommandList>
                      <CommandEmpty className="py-6 text-center text-base sm:text-lg">
                        Ingen flyvepladser fundet.
                      </CommandEmpty>
                      <CommandGroup>
                        {getAvailableAirfields().map((airfield) => (
                          <CommandItem
                            key={airfield.id}
                            value={`${airfield.name} ${airfield.icao}`}
                            onSelect={() => {
                              setSelectedAirfield(airfield)
                              setOpenAirfieldSelector(false)
                              setPin([])
                              setError("")
                              localStorage.setItem(LAST_SELECTED_AIRFIELD_KEY, airfield.icao)
                              console.log("Saved last selected airfield:", airfield.name)
                            }}
                            className="text-base sm:text-lg py-3"
                          >
                            <Check
                              className={cn(
                                "mr-3 h-5 w-5",
                                selectedAirfield?.id === airfield.id ? "opacity-100" : "opacity-0"
                              )}
                            />
                            <div className="flex flex-col">
                              <span className="font-medium">{airfield.name}</span>
                              <span className="text-sm text-gray-500">{airfield.icao} • {airfield.type}</span>
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
          )}

          {/* PIN Display */}
          <div className={`mb-6 flex justify-center space-x-4 ${shake ? 'animate-shake' : ''}`}>
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className={`h-7 w-7 rounded-full border-2 sm:h-8 sm:w-8 ${
                  selectedClub && selectedAirfield ? 'border-primary' : 'border-slate-300'
                } ${
                  pin.length > i ? (selectedClub && selectedAirfield ? "bg-primary" : "bg-slate-300") : "bg-transparent"
                } transition-all duration-200`}
              />
            ))}
          </div>

          {error && (
            <div className="mb-6 text-center text-red-500 text-base sm:text-lg font-medium">
              {error}
            </div>
          )}

          {/* Keypad */}
          <div className="grid grid-cols-3 gap-2 sm:gap-3 max-w-xs mx-auto">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 'clear', 0, 'del'].map((item) => {
              const isNumber = typeof item === 'number'
              const specialAction = typeof item === 'string' ? item : null

              return (
                <button
                  key={item}
                  onClick={() => {
                    if (isNumber) handleKeyPress(item.toString())
                    else if (specialAction === 'clear') handleClear()
                    else if (specialAction === 'del') handleDelete()
                  }}
                  disabled={!selectedClub || !selectedAirfield || isLoading}
                  className={cn(
                    "aspect-square rounded-full text-2xl sm:text-3xl font-medium transition-all duration-150 shadow-md",
                    "flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-primary/40 active:scale-95",
                    !selectedClub || !selectedAirfield || isLoading
                      ? "bg-slate-200 text-slate-400 cursor-not-allowed"
                      : specialAction
                      ? "bg-slate-200 hover:bg-slate-300 active:bg-slate-300/80"
                      : "bg-slate-100 hover:bg-slate-200 active:bg-slate-200/80"
                  )}
                  style={{ WebkitTapHighlightColor: 'transparent' }}
                >
                  {specialAction === 'clear' ? (
                    <X className="h-6 w-6 sm:h-7 sm:w-7" />
                  ) : specialAction === 'del' ? (
                    <Delete className="h-6 w-6 sm:h-7 sm:w-7" />
                  ) : (
                    item
                  )}
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
} 