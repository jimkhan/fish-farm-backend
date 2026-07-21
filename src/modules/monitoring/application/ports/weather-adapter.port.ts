export interface RawWeatherReading {
  readonly tempC: number;
  readonly condition: string;
  readonly heavyRain: boolean;
  readonly extremeHeat: boolean;
}

/**
 * Third-party weather lookup (TASK-036, ADR-018 — OpenWeather). Never throws — a missing key,
 * network failure, or non-OK response all resolve to `null` (same "never throw, return a result"
 * shape as `NotificationChannel.send()`), so callers (only `RefreshWeatherScheduler`) degrade by
 * simply not upserting rather than needing a try/catch of their own.
 */
export interface WeatherAdapterPort {
  fetch(lat: number, lng: number): Promise<RawWeatherReading | null>;
}

export const WEATHER_ADAPTER = 'WeatherAdapterPort';
