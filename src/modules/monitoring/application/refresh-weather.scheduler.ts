import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PROJECT_REPOSITORY, ProjectRepositoryPort } from '../../projects/application/ports/project-repository.port';
import { WeatherSnapshot } from '../domain/weather-snapshot.entity';
import { WEATHER_ADAPTER, WeatherAdapterPort } from './ports/weather-adapter.port';
import {
  WEATHER_SNAPSHOT_EVENT_REPOSITORY,
  WeatherSnapshotEventRepositoryPort,
} from './ports/weather-snapshot-event-repository.port';

/**
 * F1/R3 (TASK-036, AC-120/121): polls OpenWeather for every ACTIVE project's site lat/long on a
 * fixed cadence and upserts the cache `GetWeatherUseCase` reads. **Every 15 minutes** — no TTL or
 * refresh interval is stated anywhere in the spec corpus; resolved as a documented judgment call
 * (same category as TASK-017's `CRITICAL_SLA_MINUTES`), matched by `staleness.service.ts`'s
 * 30-minute (2-cycle) staleness threshold. A fetch failure for one project is logged and simply
 * skipped — the existing cache row (if any) is left untouched and naturally ages toward `stale`
 * on the read side; one project's outage never affects another's (R3's "never blocks the
 * dashboard" applies equally to this background job never blocking on a slow/down provider for
 * every other project in the batch).
 */
@Injectable()
export class RefreshWeatherScheduler {
  private readonly logger = new Logger(RefreshWeatherScheduler.name);

  constructor(
    @Inject(PROJECT_REPOSITORY) private readonly projects: ProjectRepositoryPort,
    @Inject(WEATHER_ADAPTER) private readonly weather: WeatherAdapterPort,
    @Inject(WEATHER_SNAPSHOT_EVENT_REPOSITORY)
    private readonly snapshots: WeatherSnapshotEventRepositoryPort,
  ) {}

  @Cron('0 */15 * * * *') // every 15 minutes — no CronExpression preset exists for this cadence
  async refresh(): Promise<void> {
    const activeProjects = await this.projects.findAllActive();

    for (const project of activeProjects) {
      const reading = await this.weather.fetch(project.siteLat, project.siteLng);
      if (!reading) {
        this.logger.warn(`Weather fetch failed for project ${project.id}; leaving cache as-is.`);
        continue;
      }

      const forecast =
        (await this.weather.fetchForecast(project.siteLat, project.siteLng)) ?? [];

      await this.snapshots.upsert(
        WeatherSnapshot.reconstitute({
          projectId: project.id,
          tempC: reading.tempC,
          condition: reading.condition,
          heavyRain: reading.heavyRain,
          extremeHeat: reading.extremeHeat,
          fetchedAt: new Date(),
          forecast,
          humidityPct: reading.humidityPct,
          windKmh: reading.windKmh,
          windDir: reading.windDir,
          rainMm: reading.rainMm,
          feelsLikeC: reading.feelsLikeC,
        }),
      );
    }
  }
}
