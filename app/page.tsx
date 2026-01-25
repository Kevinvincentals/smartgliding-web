import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import Link from "next/link"

export default function WelcomePage() {
  return (
    <div className="flex min-h-screen w-full flex-col items-center justify-center bg-background">
      <div className="text-center space-y-6">
        <h1 className="text-4xl font-bold tracking-tight">
          Velkommen til den digitale startliste
        </h1>
        <Button asChild size="lg">
          <Link href="/startliste">
            Gå til startliste
          </Link>
        </Button>
      </div>
    </div>
  )
}

