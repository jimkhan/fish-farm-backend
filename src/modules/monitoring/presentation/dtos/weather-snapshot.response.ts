import { WeatherResult } from '../../application/get-weather.usecase';

/** Wire shape of `GET .../weather` (CON-037, AC-120/121). */
export interface WeatherSnapshotResponse {
  projectId: string;
  tempC: number;
  condition: string;
  heavyRain: boolean;
  extremeHeat: boolean;
  fetchedAt: string;
  stale: boolean;
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
  };
}
