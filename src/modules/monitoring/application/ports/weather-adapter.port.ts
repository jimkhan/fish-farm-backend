import type { WeatherForecastDay } from '../../domain/weather-forecast-day';

export interface RawWeatherReading {
  readonly tempC: number;
  readonly condition: string;
  readonly heavyRain: boolean;
  readonly extremeHeat: boolean;
  readonly humidityPct: number | null;
  readonly windKmh: number | null;
  readonly windDir: string | null;
  readonly rainMm: number | null;
  readonly feelsLikeC: number | null;
}

/**
 * Third-party weather lookup (TASK-036, ADR-018 — OpenWeather). Never throws — a missing key,
 * network failure, or non-OK response all resolve to `null` (same "never throw, return a result"
 * shape as `NotificationChannel.send()`), so callers degrade by simply not upserting rather than
 * needing a try/catch of their own.
 */
export interface WeatherAdapterPort {
  fetch(lat: number, lng: number): Promise<RawWeatherReading | null>;
  /** 5 calendar days for W-16; `null` when the forecast call fails (current may still succeed). */
  fetchForecast(lat: number, lng: number): Promise<WeatherForecastDay[] | null>;
}

export const WEATHER_ADAPTER = 'WeatherAdapterPort';
