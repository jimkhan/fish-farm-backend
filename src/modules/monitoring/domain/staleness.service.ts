/**
 * R3/AC-121: "on API failure the cached value is served with a stale flag." No TTL is stated
 * anywhere in the spec corpus — resolved as a documented judgment call (same category as
 * TASK-017's `CRITICAL_SLA_MINUTES`): the refresh scheduler runs every 15 minutes
 * (`RefreshWeatherScheduler`), and a reading is considered stale once it's aged past 2 missed
 * cycles (30 min) — tolerating one missed tick (a transient OpenWeather blip) without flipping
 * `stale` on every borderline read, while still surfacing a real, sustained outage promptly.
 *
 * Computed live at read time from `fetchedAt`, never trusted from a persisted bit — a stored
 * "was fresh when last written" flag would silently go wrong the moment enough time passes
 * without a successful refresh.
 */
export const WEATHER_STALENESS_THRESHOLD_MS = 30 * 60_000;

export function isStale(fetchedAt: Date, now: Date): boolean {
  return now.getTime() - fetchedAt.getTime() > WEATHER_STALENESS_THRESHOLD_MS;
}
