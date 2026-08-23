/** Compass octant from OpenWeather `wind.deg` (0 = N, clockwise). */
const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const;

export function windDirFromDeg(deg: number | undefined): string | null {
  if (deg === undefined || !Number.isFinite(deg)) {
    return null;
  }
  const normalized = ((deg % 360) + 360) % 360;
  return COMPASS[Math.round(normalized / 45) % 8] ?? null;
}

/** OpenWeather metric wind is m/s — W-16 shows km/h. */
export function windMsToKmh(speedMs: number | undefined): number | null {
  if (speedMs === undefined || !Number.isFinite(speedMs)) {
    return null;
  }
  return Math.round(speedMs * 3.6 * 10) / 10;
}
