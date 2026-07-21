import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WeatherSnapshot } from '../domain/weather-snapshot.entity';
import { WeatherSnapshotEventRepositoryPort } from '../application/ports/weather-snapshot-event-repository.port';
import { WeatherSnapshotPersistenceModel } from './persistence/weather-snapshot.persistence-model';

/** Unscoped — see `WeatherSnapshotEventRepositoryPort`'s doc comment for why. */
@Injectable()
export class TypeOrmWeatherSnapshotEventRepository implements WeatherSnapshotEventRepositoryPort {
  constructor(
    @InjectRepository(WeatherSnapshotPersistenceModel)
    private readonly repository: Repository<WeatherSnapshotPersistenceModel>,
  ) {}

  async upsert(snapshot: WeatherSnapshot): Promise<void> {
    const existing = await this.repository.findOne({ where: { projectId: snapshot.projectId } });
    const model = existing ?? new WeatherSnapshotPersistenceModel();
    model.projectId = snapshot.projectId;
    model.tempC = snapshot.tempC;
    model.condition = snapshot.condition;
    model.heavyRain = snapshot.heavyRain;
    model.extremeHeat = snapshot.extremeHeat;
    model.fetchedAt = snapshot.fetchedAt;
    await this.repository.save(model);
  }
}
