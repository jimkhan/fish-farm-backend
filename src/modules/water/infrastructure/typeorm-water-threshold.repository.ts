import { Injectable } from '@nestjs/common';
import { ScopedRepository } from '../../../shared-kernel/tenant/scoped-repository';
import { WaterThreshold } from '../domain/water-threshold.entity';
import { WaterParameter } from '../domain/water-reading.entity';
import { WaterThresholdRepositoryPort } from '../application/ports/water-threshold-repository.port';
import { WaterThresholdPersistenceModel } from './persistence/water-threshold.persistence-model';
import { toDomain, toPersistence } from './persistence/water-threshold.mapper';

@Injectable()
export class TypeOrmWaterThresholdRepository implements WaterThresholdRepositoryPort {
  constructor(private readonly scoped: ScopedRepository<WaterThresholdPersistenceModel>) {}

  async findAllInCurrentProject(): Promise<WaterThreshold[]> {
    const models = await this.scoped.find();
    return models.map(toDomain);
  }

  async findByParameter(parameter: WaterParameter): Promise<WaterThreshold | null> {
    const [model] = await this.scoped.find({ parameter });
    return model ? toDomain(model) : null;
  }

  async save(threshold: WaterThreshold): Promise<WaterThreshold> {
    const saved = await this.scoped.save(toPersistence(threshold));
    return toDomain(saved);
  }
}
