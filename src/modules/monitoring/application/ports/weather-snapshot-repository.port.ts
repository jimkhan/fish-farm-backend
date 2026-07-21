import { WeatherSnapshot } from '../../domain/weather-snapshot.entity';

/** Tenant-scoped (ADR-006) — for the `GET .../weather` read query. */
export interface WeatherSnapshotRepositoryPort {
  /** `null` if weather has never been successfully fetched for this project yet. */
  findForCurrentProject(): Promise<WeatherSnapshot | null>;
}

export const WEATHER_SNAPSHOT_REPOSITORY = 'WeatherSnapshotRepositoryPort';
