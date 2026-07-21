import { Injectable } from '@nestjs/common';
import { ScopedRepository } from '../../../shared-kernel/tenant/scoped-repository';
import { WeatherSnapshot } from '../domain/weather-snapshot.entity';
import { WeatherSnapshotRepositoryPort } from '../application/ports/weather-snapshot-repository.port';
import { WeatherSnapshotPersistenceModel } from './persistence/weather-snapshot.persistence-model';
import { toDomain } from './persistence/weather-snapshot.mapper';

@Injectable()
export class TypeOrmWeatherSnapshotRepository implements WeatherSnapshotRepositoryPort {
  constructor(private readonly scoped: ScopedRepository<WeatherSnapshotPersistenceModel>) {}

  async findForCurrentProject(): Promise<WeatherSnapshot | null> {
    const [model] = await this.scoped.find();
    return model ? toDomain(model) : null;
  }
}
