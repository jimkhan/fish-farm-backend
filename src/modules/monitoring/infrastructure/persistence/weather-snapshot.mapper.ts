import { WeatherSnapshot } from '../../domain/weather-snapshot.entity';
import { WeatherSnapshotPersistenceModel } from './weather-snapshot.persistence-model';

export function toDomain(model: WeatherSnapshotPersistenceModel): WeatherSnapshot {
  return WeatherSnapshot.reconstitute({
    projectId: model.projectId,
    tempC: model.tempC,
    condition: model.condition,
    heavyRain: model.heavyRain,
    extremeHeat: model.extremeHeat,
    fetchedAt: model.fetchedAt,
    forecast: model.forecastJson ?? null,
    humidityPct: model.humidityPct ?? null,
    windKmh: model.windKmh ?? null,
    windDir: model.windDir ?? null,
    rainMm: model.rainMm ?? null,
    feelsLikeC: model.feelsLikeC ?? null,
  });
}
