import { Inject, Injectable } from '@nestjs/common';
import { NotFoundError, UnprocessableError } from '../../../shared-kernel/errors/domain-error';
import { TenantContext } from '../../../shared-kernel/tenant/tenant-context';
import {
  PROJECT_REPOSITORY,
  ProjectRepositoryPort,
} from '../../projects/application/ports/project-repository.port';
import { WeatherSnapshot } from '../domain/weather-snapshot.entity';
import { isStale } from '../domain/staleness.service';
import { WEATHER_ADAPTER, WeatherAdapterPort } from './ports/weather-adapter.port';
import {
  WEATHER_SNAPSHOT_EVENT_REPOSITORY,
  WeatherSnapshotEventRepositoryPort,
} from './ports/weather-snapshot-event-repository.port';
import { WeatherResult } from './get-weather.usecase';

/**
 * On-demand weather refresh for the current project (Owner/Worker). Pulls OpenWeather once,
 * upserts the cache `GET .../weather` reads, and returns the fresh snapshot. Cron remains the
 * background path; this exists so the W-16 Refresh control actually syncs instead of re-reading
 * a stale seed row.
 */
@Injectable()
export class RefreshProjectWeatherUseCase {
  constructor(
    private readonly tenant: TenantContext,
    @Inject(PROJECT_REPOSITORY) private readonly projects: ProjectRepositoryPort,
    @Inject(WEATHER_ADAPTER) private readonly weather: WeatherAdapterPort,
    @Inject(WEATHER_SNAPSHOT_EVENT_REPOSITORY)
    private readonly snapshots: WeatherSnapshotEventRepositoryPort,
  ) {}

  async execute(): Promise<WeatherResult> {
    const project = await this.projects.findById(this.tenant.projectId);
    if (!project) {
      throw new NotFoundError('Project not found.');
    }

    const reading = await this.weather.fetch(project.siteLat, project.siteLng);
    if (!reading) {
      throw new UnprocessableError(
        'Could not refresh weather from the provider. Configure OPENWEATHER_API_KEY in the API .env, or try again later.',
        { reason: 'WEATHER_PROVIDER_UNAVAILABLE' },
      );
    }

    const forecast = (await this.weather.fetchForecast(project.siteLat, project.siteLng)) ?? [];

    const fetchedAt = new Date();
    const snapshot = WeatherSnapshot.reconstitute({
      projectId: project.id,
      tempC: reading.tempC,
      condition: reading.condition,
      heavyRain: reading.heavyRain,
      extremeHeat: reading.extremeHeat,
      fetchedAt,
      forecast,
      humidityPct: reading.humidityPct,
      windKmh: reading.windKmh,
      windDir: reading.windDir,
      rainMm: reading.rainMm,
      feelsLikeC: reading.feelsLikeC,
    });
    await this.snapshots.upsert(snapshot);

    return { snapshot, stale: isStale(fetchedAt, fetchedAt) };
  }
}
