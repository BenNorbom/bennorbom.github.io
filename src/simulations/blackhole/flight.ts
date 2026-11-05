import { DURATION } from './physics'

export const APOAPSIS = 35
export const PERIAPSIS = 7.2
export const DISK_CLEARANCE = 0.55

const farHeight = APOAPSIS * Math.sin(0.115)
const farPlanarRadius = APOAPSIS * Math.cos(0.115)
const major = (farPlanarRadius + PERIAPSIS) / 2
const focalOffset = (farPlanarRadius - PERIAPSIS) / 2
const minor = Math.sqrt(farPlanarRadius * PERIAPSIS)

export interface FlightChapter {
  time: number
  title: string
  shortLabel: string
}

export const FLIGHT_CHAPTERS: FlightChapter[] = [
  { time: 0, title: 'Distant Silhouette (35 M)', shortLabel: '0:00 · Distant Silhouette' },
  { time: 75, title: 'Inward Approach', shortLabel: '1:15 · Inward Plunge' },
  { time: 150, title: 'Disk Skim (7.22 M Periapsis)', shortLabel: '2:30 · Disk Skim' },
  { time: 225, title: 'Outward Return', shortLabel: '3:45 · Outward Return' },
]

export interface FlightPose {
  radius: number
  theta: number
  phi: number
  roll: number
  fov: number
  bloom: number
  lookYaw: number
  lookPitch: number
  phase: string
}

export function flightAt(seconds: number): FlightPose {
  const time = Number.isFinite(seconds) ? ((seconds % DURATION) + DURATION) % DURATION : 0
  const angle = (time / DURATION) * Math.PI * 2
  const x = focalOffset + major * Math.cos(angle)
  const y = minor * Math.sin(angle)
  const height = DISK_CLEARANCE + ((farHeight - DISK_CLEARANCE) * (1 + Math.cos(angle))) / 2
  const radius = Math.hypot(x, y, height)
  const proximity = ((1 - Math.cos(angle)) / 2) ** 2
  const chapterIndex = Math.min(FLIGHT_CHAPTERS.length - 1, Math.floor(time / 75))
  return {
    radius,
    theta: Math.acos(height / radius),
    phi: 1.06 + Math.atan2(y, x) + (angle > Math.PI ? 2 * Math.PI : 0),
    roll: 0.025 * Math.sin(angle),
    fov: 47 + proximity,
    bloom: 0.12 - (0.11 * (1 - Math.cos(angle))) / 2,
    lookYaw: 0.35 * proximity,
    lookPitch: 0.03 * proximity,
    phase: FLIGHT_CHAPTERS[chapterIndex].title,
  }
}
