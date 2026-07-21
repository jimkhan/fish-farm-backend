import { WeatherSnapshot } from '../../domain/weather-snapshot.entity';

/**
 * Unscoped, by explicit `projectId` (TASK-036). Used only by `RefreshWeatherScheduler`, which
 * runs on a `@Cron` tick — not inside an HTTP request — so there is structurally no
 * `TenantContext` to scope through (same exception class as `BatchEventRepositoryPort`,
 * likewise used by a scheduler — `FeedingReminderScheduler`, TASK-021).
 */
export interface WeatherSnapshotEventRepositoryPort {
  /** Upserts the project's one cache row (ERD: 1:1 per project). */
  upsert(snapshot: WeatherSnapshot): Promise<void>;
}

export const WEATHER_SNAPSHOT_EVENT_REPOSITORY = 'WeatherSnapshotEventRepositoryPort';
