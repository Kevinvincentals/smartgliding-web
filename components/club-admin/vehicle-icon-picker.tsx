"use client"

import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import { VEHICLE_ICON_KEYS, VEHICLE_ICONS, VEHICLE_ICON_LABELS, type VehicleIconKey } from "@/lib/vehicle-icons"

interface VehicleIconPickerProps {
  value: VehicleIconKey
  onChange: (icon: VehicleIconKey) => void
}

export function VehicleIconPicker({ value, onChange }: VehicleIconPickerProps) {
  return (
    <div className="space-y-2">
      <Label>Ikon</Label>
      <div className="grid grid-cols-3 gap-2">
        {VEHICLE_ICON_KEYS.map((key) => {
          const Icon = VEHICLE_ICONS[key]
          return (
            <button
              key={key}
              type="button"
              onClick={() => onChange(key)}
              className={cn(
                "flex flex-col items-center gap-1 rounded-md border p-3 text-xs transition-colors hover:bg-muted/50",
                value === key
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-input text-muted-foreground"
              )}
            >
              <Icon className="h-6 w-6" />
              {VEHICLE_ICON_LABELS[key]}
            </button>
          )
        })}
      </div>
    </div>
  )
}
