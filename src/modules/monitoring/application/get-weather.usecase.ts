import { Inject, Injectable } from '@nestjs/common';
import { NotFoundError } from '../../../shared-kernel/errors/domain-error';
import { isStale } from '../domain/staleness.service';
import { WeatherSnapshot } from '../domain/weather-snapshot.entity';
import {
  WEATHER_SNAPSHOT_REPOSITORY,
  WeatherSnapshotRepositoryPort,
} from './ports/weather-snapshot-repository.port';

export interface WeatherResult {
  readonly snapshot: WeatherSnapshot;
  readonly stale: boolean;
}

/**
 * `GET /projects/{projectId}/weather` (CON-037, F1, R3/R4, AC-120/121). Member-only — same
 * reasoning as camera (TASK-035): weather is grouped with every role's normal read access, not
 * role-gated.
 *
 * **Never calls OpenWeather** — reads only the cache `RefreshWeatherScheduler` maintains (R3:
 * "never blocks the dashboard"). `stale` is computed live from `fetchedAt` on every read, never
 * trusted from a persisted bit (see `staleness.service.ts`'s doc comment for why). No cache row
 * at all (a brand-new project, or one the scheduler hasn't reached yet) is a legitimate 404 —
 * same "no camera configured yet" shape as TASK-035, not an error to paper over.
 */
@Injectable()
export class GetWeatherUseCase {
  constructor(
    @Inject(WEATHER_SNAPSHOT_REPOSITORY) private readonly snapshots: WeatherSnapshotRepositoryPort,
  ) {}

  async execute(): Promise<WeatherResult> {
    const snapshot = await this.snapshots.findForCurrentProject();
    if (!snapshot) {
      throw new NotFoundError('No weather has been fetched for this project yet.');
    }
    return { snapshot, stale: isStale(snapshot.fetchedAt, new Date()) };
  }
}
