"use client"

import { useState, useEffect } from "react"
import { ClockIcon } from "lucide-react"

export function Clock() {
  const [time, setTime] = useState<string>("")

  // Update clock
  useEffect(() => {
    const updateClock = () => {
      const now = new Date()
      const timeString = now.toLocaleTimeString("da-DK", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
      setTime(timeString)
    }

    updateClock()
    const interval = setInterval(updateClock, 1000)

    return () => clearInterval(interval)
  }, [])

  return (
    <div className="flex items-center">
      <div className="flex items-center gap-1 text-lg font-medium">
        <ClockIcon className="h-5 w-5" />
        <span>{time}</span>
      </div>
    </div>
  )
}

