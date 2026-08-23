import { WeatherResult } from '../../application/get-weather.usecase';
import type { WeatherForecastDay } from '../../domain/weather-forecast-day';

/** Wire shape of `GET .../weather` (CON-037, AC-120/121) + W-16 metrics/forecast. */
export interface WeatherSnapshotResponse {
  projectId: string;
  tempC: number;
  condition: string;
  heavyRain: boolean;
  extremeHeat: boolean;
  fetchedAt: string;
  stale: boolean;
  forecast: WeatherForecastDay[] | null;
  humidityPct: number | null;
  windKmh: number | null;
  windDir: string | null;
  rainMm: number | null;
  feelsLikeC: number | null;
}

export function toWeatherSnapshotResponse(result: WeatherResult): WeatherSnapshotResponse {
  return {
    projectId: result.snapshot.projectId,
    tempC: result.snapshot.tempC,
    condition: result.snapshot.condition,
    heavyRain: result.snapshot.heavyRain,
    extremeHeat: result.snapshot.extremeHeat,
    fetchedAt: result.snapshot.fetchedAt.toISOString(),
    stale: result.stale,
    forecast: result.snapshot.forecast ? [...result.snapshot.forecast] : null,
    humidityPct: result.snapshot.humidityPct,
    windKmh: result.snapshot.windKmh,
    windDir: result.snapshot.windDir,
    rainMm: result.snapshot.rainMm,
    feelsLikeC: result.snapshot.feelsLikeC,
  };
}
