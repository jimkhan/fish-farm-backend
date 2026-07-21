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
  });
}
