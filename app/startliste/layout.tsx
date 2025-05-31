"use client"

import { StartlisteHeader } from "./components/header"
import { StartlisteProvider } from "@/contexts/startlist-context"

export default function StartlisteLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <StartlisteProvider>
      <div className="flex min-h-screen w-full flex-col bg-background pt-3 sm:pt-0">
        {children}
      </div>
    </StartlisteProvider>
  )
} 