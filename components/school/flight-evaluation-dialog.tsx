"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Loader2, GraduationCap, CheckCircle, AlertCircle, X, ChevronDown, ChevronRight, Check, Clock, Delete } from "lucide-react"
import { toast } from "sonner"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"

interface Exercise {
  id: string
  text: string
  order: number
}

interface Module {
  id: string
  moduleId: string
  titel: string
  exercises: Exercise[]
}

interface SchoolFlight {
  id: string
  date: Date
  flightDuration: number | null
  registration: string | null
  type: string | null
  instructorName: string | null
  takeoffTime: Date | null
  landingTime: Date | null
}

interface FlightEvaluationDialogProps {
  isOpen: boolean
  onClose: () => void
  flight: SchoolFlight
  pilotId: string
  pilotName: string
  modules: Module[]
}

interface PilotProgress {
  exerciseId: string
  moduleId: string
  bestGrade: number
  evaluationCount: number
  lastEvaluatedAt: Date
  evaluatedBy?: string
}

const gradeOptions = [
  { value: "null", label: "Ikke trænet", icon: null },
  { value: "1", label: "Endnu ej bestået", icon: X },
  { value: "2", label: "Endnu ej bestået (med korrektioner)", icon: AlertCircle },
  { value: "3", label: "Bestået", icon: CheckCircle }
]

export function FlightEvaluationDialog({ 
  isOpen, 
  onClose, 
  flight, 
  pilotId, 
  pilotName, 
  modules 
}: FlightEvaluationDialogProps) {
  const [evaluations, setEvaluations] = useState<Record<string, string>>({}) // simplified to string values
  const [instructorPin, setInstructorPin] = useState("")
  const [notes, setNotes] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isLoadingProgress, setIsLoadingProgress] = useState(false)
  const [pilotProgress, setPilotProgress] = useState<Record<string, PilotProgress>>({})
  const [openModules, setOpenModules] = useState<Set<string>>(new Set())
  const [dialogPage, setDialogPage] = useState<"evaluation" | "pin" | "success">("evaluation")
  const [pinError, setPinError] = useState("")

  // Reset and fetch data when dialog opens
  useEffect(() => {
    if (!isOpen) return
    
    setEvaluations({})
    setInstructorPin("")
    setNotes("")
    setPilotProgress({})
    
    // Start with all modules expanded
    setOpenModules(new Set(modules.map(m => m.id)))
    
    // Reset dialog states
    setDialogPage("evaluation")
    setPinError("")
    
    // Fetch pilot progress
    setIsLoadingProgress(true)
    fetch(`/api/tablet/dsvu/fetch_pilot_progress?pilotId=${pilotId}`)
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          const progressMap: Record<string, PilotProgress> = {}
          const initialEvals: Record<string, string> = {}
          
          // Convert progress array to map for fast lookup
          data.progress?.forEach((p: PilotProgress) => {
            progressMap[p.exerciseId] = p
            initialEvals[p.exerciseId] = p.bestGrade.toString()
          })
          
          // Initialize all exercises with existing grades or "null"
          modules.forEach(module => {
            module.exercises.forEach(exercise => {
              if (!initialEvals[exercise.id]) {
                initialEvals[exercise.id] = "null"
              }
            })
          })
          
          setPilotProgress(progressMap)
          setEvaluations(initialEvals)
        }
      })
      .catch(error => {
        console.error('Error fetching pilot progress:', error)
        // Initialize with empty values on error
        const initialEvals: Record<string, string> = {}
        modules.forEach(module => {
          module.exercises.forEach(exercise => {
            initialEvals[exercise.id] = "null"
          })
        })
        setEvaluations(initialEvals)
      })
      .finally(() => {
        setIsLoadingProgress(false)
      })
  }, [isOpen, pilotId, modules])

  const toggleModule = (moduleId: string) => {
    const newOpenModules = new Set(openModules)
    if (newOpenModules.has(moduleId)) {
      newOpenModules.delete(moduleId)
    } else {
      newOpenModules.add(moduleId)
    }
    setOpenModules(newOpenModules)
  }

  const isModuleCompleted = (module: Module) => {
    return module.exercises.every(exercise => {
      const grade = evaluations[exercise.id]
      return grade === "3" // All exercises must be "Bestået"
    })
  }

  const isModuleInProgress = (module: Module) => {
    const exerciseGrades = module.exercises.map(exercise => evaluations[exercise.id])
    const hasAnyGrades = exerciseGrades.some(grade => grade && grade !== "null")
    const allCompleted = exerciseGrades.every(grade => grade === "3")
    
    return hasAnyGrades && !allCompleted // Has some progress but not fully completed
  }

  const handleGradeChange = (exerciseId: string, grade: string) => {
    setEvaluations(prev => ({
      ...prev,
      [exerciseId]: grade
    }))
  }

  const formatTime = (time: Date | null) => {
    if (!time) return '-'
    return new Date(time).toLocaleTimeString('da-DK', {
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString('da-DK', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    })
  }

  const formatFlightDuration = (minutes: number | null) => {
    if (!minutes) return 'N/A'
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    return `${hours}:${mins.toString().padStart(2, '0')}`
  }

  const handleSubmit = async () => {
    // Get only evaluations with grades (not "null")
    const evaluationsToSubmit = Object.entries(evaluations)
      .filter(([_, grade]) => grade !== "null")
      .map(([exerciseId, grade]) => {
        // Find module for this exercise
        let moduleId = ""
        modules.forEach(module => {
          module.exercises.forEach(exercise => {
            if (exercise.id === exerciseId) {
              moduleId = module.moduleId
            }
          })
        })
        return {
          exerciseId,
          moduleId,
          grade: parseInt(grade)
        }
      })
    
    if (evaluationsToSubmit.length === 0) {
      toast.error("Vælg venligst mindst én øvelse at vurdere")
      return
    }

    // Transition to PIN entry page
    setDialogPage("pin")
  }

  const evaluatedCount = Object.values(evaluations).filter(grade => grade !== "null").length

  const handleKeypadNumber = (num: string) => {
    if (instructorPin.length < 4) {
      const newPin = instructorPin + num
      setInstructorPin(newPin)
      setPinError("")
      
      // Auto-submit when 4 digits are entered
      if (newPin.length === 4) {
        setTimeout(() => {
          handlePinSubmit(newPin)
        }, 100) // Small delay for visual feedback
      }
    }
  }

  const handleKeypadBackspace = () => {
    setInstructorPin(prev => prev.slice(0, -1))
    setPinError("")
  }

  const handleKeypadClear = () => {
    setInstructorPin("")
    setPinError("")
  }

  const handlePinSubmit = async (pinToSubmit?: string) => {
    const finalPin = pinToSubmit || instructorPin
    
    // Validate PIN
    if (finalPin.length !== 4) {
      setPinError("PIN skal være 4 cifre")
      return
    }

    setIsSubmitting(true)

    try {
      // Get evaluations to submit
      const evaluationsToSubmit = Object.entries(evaluations)
        .filter(([_, grade]) => grade !== "null")
        .map(([exerciseId, grade]) => {
          let moduleId = ""
          modules.forEach(module => {
            module.exercises.forEach(exercise => {
              if (exercise.id === exerciseId) {
                moduleId = module.moduleId
              }
            })
          })
          return {
            exerciseId,
            moduleId,
            grade: parseInt(grade)
          }
        })

      const response = await fetch('/api/tablet/dsvu/submit_flight_evaluation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          flightId: flight.id,
          pilotId: pilotId,
          instructorPin: parseInt(finalPin),
          evaluations: evaluationsToSubmit,
          notes: notes.trim() || undefined
        })
      })

      const data = await response.json()

      if (data.success) {
        setDialogPage("success")
        // Auto-close after success animation
        setTimeout(() => {
          onClose()
        }, 2000)
      } else {
        setPinError(data.error || "Forkert PIN")
        setIsSubmitting(false)
      }
    } catch (error) {
      console.error('Error submitting evaluation:', error)
      setPinError("Netværksfejl")
      setIsSubmitting(false)
    }
  }

  if (!isOpen) return null

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl flex items-center gap-2">
            <GraduationCap className="h-6 w-6 text-primary" />
            {dialogPage === "evaluation" && `Evaluer flyvning - ${pilotName}`}
            {dialogPage === "pin" && "Bekræft med instruktør PIN"}
            {dialogPage === "success" && "Evaluering gemt!"}
          </DialogTitle>
          {dialogPage === "evaluation" && (
            <p className="text-sm text-gray-600">
              Evaluering påbegyndt: {new Date().toLocaleString('da-DK')}
            </p>
          )}
        </DialogHeader>

        {dialogPage === "evaluation" && (
          <>
            {isLoadingProgress ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-primary mr-3" />
                <span>Indlæser pilotens fremskridt...</span>
              </div>
            ) : (
              <>
                {/* Flight Information */}
                <Card className="mb-4">
                  <CardHeader>
                    <CardTitle className="text-lg">Flyvningsdetaljer</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-gray-600">Fly:</span>
                        <span className="ml-2 font-medium">
                          {flight.registration || 'N/A'} {flight.type && `(${flight.type})`}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-600">Dato:</span>
                        <span className="ml-2 font-medium">{formatDate(flight.date)}</span>
                      </div>
                      <div>
                        <span className="text-gray-600">Start tid:</span>
                        <span className="ml-2 font-medium">{formatTime(flight.takeoffTime)}</span>
                      </div>
                      <div>
                        <span className="text-gray-600">Landing tid:</span>
                        <span className="ml-2 font-medium">{formatTime(flight.landingTime)}</span>
                      </div>
                      <div>
                        <span className="text-gray-600">Flyvetid:</span>
                        <span className="ml-2 font-medium">{formatFlightDuration(flight.flightDuration)}</span>
                      </div>
                      <div>
                        <span className="text-gray-600">Instruktør:</span>
                        <span className="ml-2 font-medium">{flight.instructorName || 'N/A'}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Exercise Evaluation */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold">Øvelses evaluering</h3>
                    <Badge variant="outline" className="text-sm">
                      {evaluatedCount} øvelser vurderet
                    </Badge>
                  </div>

                  {modules.map(module => {
                    const isOpen = openModules.has(module.id)
                    const isCompleted = isModuleCompleted(module)
                    const isInProgress = isModuleInProgress(module)
                    
                    return (
                      <Card key={module.id} className="border-gray-200">
                        <Collapsible>
                          <CollapsibleTrigger
                            onClick={() => toggleModule(module.id)}
                            className="w-full"
                          >
                            <CardHeader className="hover:bg-gray-50/50 transition-colors py-4">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                  {isOpen ? (
                                    <ChevronDown className="h-5 w-5 text-gray-600 flex-shrink-0" />
                                  ) : (
                                    <ChevronRight className="h-5 w-5 text-gray-600 flex-shrink-0" />
                                  )}
                                  <div className="text-left flex-1">
                                    <div className="flex items-center gap-3">
                                      <CardTitle className="text-base text-blue-800">
                                        {module.moduleId}: {module.titel}
                                      </CardTitle>
                                      {isCompleted && (
                                        <div className="flex items-center gap-1 text-green-600">
                                          <Check className="h-4 w-4" />
                                          <span className="text-sm font-medium">Alle øvelser bestået</span>
                                        </div>
                                      )}
                                      {!isCompleted && isInProgress && (
                                        <div className="flex items-center gap-1 text-blue-600">
                                          <Clock className="h-4 w-4" />
                                          <span className="text-sm font-medium">I gang</span>
                                        </div>
                                      )}
                                    </div>
                                    <div className="text-sm text-gray-600 mt-1">
                                      {module.exercises.length} øvelser
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </CardHeader>
                          </CollapsibleTrigger>
                          
                          <CollapsibleContent>
                            <CardContent className="pt-0 pb-4">
                              <div className="space-y-3">
                                {module.exercises
                                  .sort((a, b) => a.order - b.order)
                                  .map(exercise => {
                                    const currentGrade = evaluations[exercise.id] || "null"
                                    const existingProgress = pilotProgress[exercise.id]
                                    const selectedOption = gradeOptions.find(opt => opt.value === currentGrade) || gradeOptions[0]
                                    
                                    return (
                                      <div key={exercise.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                                        <div className="flex-1 mr-4">
                                          <p className="text-sm font-medium text-gray-900">{exercise.text}</p>
                                          {existingProgress && (
                                            <div className="mt-1 text-xs text-gray-600">
                                              Nuværende niveau: <span className="font-medium">
                                                {gradeOptions.find(opt => opt.value === existingProgress.bestGrade.toString())?.label || "Ukendt"}
                                              </span>
                                              {existingProgress.evaluationCount > 1 && (
                                                <span> • {existingProgress.evaluationCount} evalueringer</span>
                                              )}
                                            </div>
                                          )}
                                        </div>
                                        <div className="w-64">
                                          <Select
                                            value={currentGrade}
                                            onValueChange={(value) => handleGradeChange(exercise.id, value)}
                                          >
                                            <SelectTrigger className="w-full">
                                              <SelectValue>
                                                <div className="flex items-center gap-2">
                                                  {selectedOption.icon && <selectedOption.icon className="h-4 w-4" />}
                                                  <span>{selectedOption.label}</span>
                                                </div>
                                              </SelectValue>
                                            </SelectTrigger>
                                            <SelectContent>
                                              {gradeOptions.map(option => (
                                                <SelectItem key={option.value} value={option.value}>
                                                  <div className="flex items-center gap-2">
                                                    {option.icon && <option.icon className="h-4 w-4" />}
                                                    <span>{option.label}</span>
                                                  </div>
                                                </SelectItem>
                                              ))}
                                            </SelectContent>
                                          </Select>
                                        </div>
                                      </div>
                                    )
                                  })}
                              </div>
                            </CardContent>
                          </CollapsibleContent>
                        </Collapsible>
                      </Card>
                    )
                  })}
                </div>

                {/* Notes */}
                <div className="space-y-2">
                  <Label htmlFor="notes">Noter (valgfrit)</Label>
                  <Textarea
                    id="notes"
                    placeholder={`Tilføj noter til denne evaluering af ${pilotName}...`}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={3}
                  />
                  <p className="text-xs text-gray-500">
                    Disse noter vil blive gemt for alle øvelser i denne evaluering
                  </p>
                </div>
              </>
            )}
          </>
        )}

        {dialogPage === "pin" && (
          <div className="flex flex-col items-center justify-center py-8 space-y-6">
            <div className="text-center">
              <h3 className="text-lg font-semibold mb-2">Indtast instruktør PIN</h3>
              <p className="text-gray-600 mb-6">Bekræft din evaluering med din 4-cifrede PIN</p>
              
              {/* PIN Display */}
              <div className="flex justify-center gap-2 mb-6">
                {[0, 1, 2, 3].map(index => (
                  <div
                    key={index}
                    className={`w-12 h-12 border-2 rounded-lg flex items-center justify-center text-xl font-bold ${
                      isSubmitting ? 'border-blue-400 bg-blue-50' : 'border-gray-300'
                    }`}
                  >
                    {instructorPin[index] ? '•' : ''}
                  </div>
                ))}
              </div>

              {isSubmitting && (
                <div className="flex items-center justify-center gap-2 text-blue-600 mb-4">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm">Gemmer evaluering...</span>
                </div>
              )}

              {pinError && (
                <div className="text-red-600 text-sm mb-4">{pinError}</div>
              )}
            </div>

            {/* Keypad */}
            <div className="grid grid-cols-3 gap-3 max-w-xs">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
                <Button
                  key={num}
                  variant="outline"
                  size="lg"
                  className="h-16 w-16 text-xl font-semibold"
                  onClick={() => handleKeypadNumber(num.toString())}
                  disabled={isSubmitting}
                >
                  {num}
                </Button>
              ))}
              
              <Button
                variant="outline"
                size="lg"
                className="h-16 w-16"
                onClick={handleKeypadClear}
                disabled={isSubmitting}
              >
                C
              </Button>
              
              <Button
                variant="outline"
                size="lg"
                className="h-16 w-16 text-xl font-semibold"
                onClick={() => handleKeypadNumber("0")}
                disabled={isSubmitting}
              >
                0
              </Button>
              
              <Button
                variant="outline"
                size="lg"
                className="h-16 w-16"
                onClick={handleKeypadBackspace}
                disabled={isSubmitting}
              >
                <Delete className="h-5 w-5" />
              </Button>
            </div>
          </div>
        )}

        {dialogPage === "success" && (
          <div className="flex flex-col items-center justify-center py-16 space-y-6">
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center">
              <CheckCircle className="h-12 w-12 text-green-600 animate-pulse" />
            </div>
            <div className="text-center">
              <h3 className="text-2xl font-bold text-green-800 mb-2">Evaluering gemt!</h3>
              <p className="text-gray-600">Din vurdering af {pilotName} er nu registreret</p>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          {dialogPage === "evaluation" && (
            <>
              <Button variant="outline" onClick={onClose} disabled={isLoadingProgress}>
                Annuller
              </Button>
              <Button onClick={handleSubmit} disabled={isLoadingProgress}>
                Gem evaluering
              </Button>
            </>
          )}
          
          {dialogPage === "pin" && (
            <Button variant="outline" onClick={() => setDialogPage("evaluation")} disabled={isSubmitting}>
              Tilbage
            </Button>
          )}
          
          {dialogPage === "success" && (
            <Button onClick={onClose} className="w-full">
              Luk
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
} 