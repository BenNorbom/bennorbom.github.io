export const MASS_SOLAR = 100_000_000
export const SPIN = 0.8
export const DURATION = 300
export const GRAVITATIONAL_RADIUS_KM = (6.67430e-11 * 1.98847e30 * MASS_SOLAR) / 299792458 ** 2 / 1000
export const AU_KM = 149597870.7
export const TIME_COMPRESSION = 1800

export function horizonRadius(spin: number): number {
  if (!Number.isFinite(spin) || Math.abs(spin) > 1) {
    throw new RangeError('Spin must be between -1 and 1')
  }
  return 1 + Math.sqrt(1 - spin * spin)
}

export function iscoRadius(spin: number): number {
  horizonRadius(spin)
  const first = 1 + Math.cbrt(1 - spin * spin) * (Math.cbrt(1 + spin) + Math.cbrt(1 - spin))
  const second = Math.sqrt(3 * spin * spin + first * first)
  return 3 + second - Math.sign(spin) * Math.sqrt((3 - first) * (3 + first + 2 * second))
}

export function clampTime(seconds: number): number {
  return Number.isFinite(seconds) ? Math.max(0, Math.min(DURATION, seconds)) : 0
}
