import { Cable, Car, Truck, Tractor, Bus, Caravan, type LucideIcon } from "lucide-react"

// Baked-in icon choices for ground vehicles. The key is stored on the
// GroundVehicle document, so keys must stay stable.
export const VEHICLE_ICON_KEYS = ["cable", "car", "truck", "tractor", "bus", "caravan"] as const
export type VehicleIconKey = (typeof VEHICLE_ICON_KEYS)[number]

export const VEHICLE_ICONS: Record<VehicleIconKey, LucideIcon> = {
  cable: Cable, // Spil / wire
  car: Car, // Wirehenter
  truck: Truck,
  tractor: Tractor,
  bus: Bus,
  caravan: Caravan,
}

export const VEHICLE_ICON_LABELS: Record<VehicleIconKey, string> = {
  cable: "Spil / wire",
  car: "Bil",
  truck: "Lastbil",
  tractor: "Traktor",
  bus: "Bus",
  caravan: "Campingvogn",
}

// Inline SVG bodies (lucide 0.454 path data) for use in Leaflet divIcon HTML,
// where React components can't render. Wrapped by svgForVehicleIcon().
const VEHICLE_ICON_SVG_BODY: Record<VehicleIconKey, string> = {
  cable:
    '<path d="M17 21v-2a1 1 0 0 1-1-1v-1a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1a1 1 0 0 1-1 1" /><path d="M19 15V6.5a1 1 0 0 0-7 0v11a1 1 0 0 1-7 0V9" /><path d="M21 21v-2h-4" /><path d="M3 5h4V3" /><path d="M7 5a1 1 0 0 1 1 1v1a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a1 1 0 0 1 1-1V3" />',
  car:
    '<path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2" /><circle cx="7" cy="17" r="2" /><path d="M9 17h6" /><circle cx="17" cy="17" r="2" />',
  truck:
    '<path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2" /><path d="M15 18H9" /><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14" /><circle cx="17" cy="18" r="2" /><circle cx="7" cy="18" r="2" />',
  tractor:
    '<path d="m10 11 11 .9a1 1 0 0 1 .8 1.1l-.665 4.158a1 1 0 0 1-.988.842H20" /><path d="M16 18h-5" /><path d="M18 5a1 1 0 0 0-1 1v5.573" /><path d="M3 4h8.129a1 1 0 0 1 .99.863L13 11.246" /><path d="M4 11V4" /><path d="M7 15h.01" /><path d="M8 10.1V4" /><circle cx="18" cy="18" r="2" /><circle cx="7" cy="15" r="5" />',
  bus:
    '<path d="M8 6v6" /><path d="M15 6v6" /><path d="M2 12h19.6" /><path d="M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H4a2 2 0 0 0-2 2v10h3" /><circle cx="7" cy="18" r="2" /><path d="M9 18h5" /><circle cx="16" cy="18" r="2" />',
  caravan:
    '<path d="M18 19V9a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v8a2 2 0 0 0 2 2h2" /><path d="M2 9h3a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H2" /><path d="M22 17v1a1 1 0 0 1-1 1H10v-9a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v9" /><circle cx="8" cy="19" r="2" />',
}

const STARTBORD_ICON_SVG_BODY =
  '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" /><line x1="4" x2="4" y1="22" y2="15" />'

function wrapSvg(body: string, size: number, color: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`
}

export function svgForVehicleIcon(key: string, size = 20, color = "white"): string {
  const body = VEHICLE_ICON_SVG_BODY[(key as VehicleIconKey) in VEHICLE_ICON_SVG_BODY ? (key as VehicleIconKey) : "car"]
  return wrapSvg(body, size, color)
}

export function svgForStartbordIcon(size = 20, color = "white"): string {
  return wrapSvg(STARTBORD_ICON_SVG_BODY, size, color)
}

// Normalize an OGN/FLARM device ID: strip tracker prefixes and uppercase,
// so "OGN3E5C12" / "flr3e5c12" / "3E5C12" all compare equal.
export function normalizeOgnId(id: string): string {
  return id.trim().toUpperCase().replace(/^(FLR|OGN|ICA)/, "")
}
