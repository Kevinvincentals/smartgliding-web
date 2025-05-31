import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Loader2 } from "lucide-react"

interface DisplaySettingsProps {
  hideCompleted: boolean
  setHideCompleted: (value: boolean) => void
  hideDeleted: boolean
  setHideDeleted: (value: boolean) => void
  compactMode: boolean
  setCompactMode: (value: boolean) => void
  schoolEnabled: boolean
  setSchoolEnabled: (value: boolean) => void
  isLoading: boolean
}

export function DisplaySettings({
  hideCompleted,
  setHideCompleted,
  hideDeleted,
  setHideDeleted,
  compactMode,
  setCompactMode,
  schoolEnabled,
  setSchoolEnabled,
  isLoading
}: DisplaySettingsProps) {
  return (
    <>
      <div className="flex items-center justify-between mt-4">
        <div className="space-y-0.5">
          <Label className="text-base" htmlFor="hide-completed">
            Skjul Afsluttede Flyvninger
          </Label>
          <p className="text-sm text-muted-foreground">Vis kun aktive og ventende flyvninger i startlisten</p>
        </div>
        <div className="w-[44px] h-[24px] flex items-center justify-center">
          {isLoading ? (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          ) : (
            <Switch id="hide-completed" checked={hideCompleted} onCheckedChange={setHideCompleted} />
          )}
        </div>
      </div>

      <div className="flex items-center justify-between mt-4">
        <div className="space-y-0.5">
          <Label className="text-base" htmlFor="hide-deleted">
            Skjul Slettede Flyvninger
          </Label>
          <p className="text-sm text-muted-foreground">Vis ikke slettede flyvninger i startlisten</p>
        </div>
        <div className="w-[44px] h-[24px] flex items-center justify-center">
          {isLoading ? (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          ) : (
            <Switch id="hide-deleted" checked={hideDeleted} onCheckedChange={setHideDeleted} />
          )}
        </div>
      </div>

      <div className="flex items-center justify-between mt-4">
        <div className="space-y-0.5">
          <Label className="text-base" htmlFor="compact-mode">
            Kompakt Visning
          </Label>
          <p className="text-sm text-muted-foreground">Vis flere flyvninger på skærmen med mindre mellemrum</p>
        </div>
        <div className="w-[44px] h-[24px] flex items-center justify-center">
          {isLoading ? (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          ) : (
            <Switch id="compact-mode" checked={compactMode} onCheckedChange={setCompactMode} />
          )}
        </div>
      </div>

      <div className="flex items-center justify-between mt-4">
        <div className="space-y-0.5">
          <Label className="text-base" htmlFor="school-enabled">
            Aktivér Skoling Fane
          </Label>
          <p className="text-sm text-muted-foreground">Vis "Skoling" fanen i navigationen med DSVU uddannelseskatalog</p>
        </div>
        <div className="w-[44px] h-[24px] flex items-center justify-center">
          {isLoading ? (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          ) : (
            <Switch id="school-enabled" checked={schoolEnabled} onCheckedChange={setSchoolEnabled} />
          )}
        </div>
      </div>
    </>
  )
}

