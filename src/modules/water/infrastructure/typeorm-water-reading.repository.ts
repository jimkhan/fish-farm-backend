import { Injectable } from '@nestjs/common';
import { Between } from 'typeorm';
import { ScopedRepository } from '../../../shared-kernel/tenant/scoped-repository';
import { WaterReading, WaterParameter } from '../domain/water-reading.entity';
import { WaterReadingRepositoryPort } from '../application/ports/water-reading-repository.port';
import { WaterReadingPersistenceModel } from './persistence/water-reading.persistence-model';
import { toDomain, toPersistence } from './persistence/water-reading.mapper';

@Injectable()
export class TypeOrmWaterReadingRepository implements WaterReadingRepositoryPort {
  constructor(private readonly scoped: ScopedRepository<WaterReadingPersistenceModel>) {}

  async findForPond(pondId: string, parameter?: WaterParameter): Promise<WaterReading[]> {
    const models = await this.scoped.find(parameter ? { pondId, parameter } : { pondId });
    return models.map(toDomain);
  }

  async findForPondBetween(
    pondId: string,
    parameter: WaterParameter,
    fromInclusive: Date,
    toExclusive: Date,
  ): Promise<WaterReading[]> {
    const models = await this.scoped.find({
      pondId,
      parameter,
      readAt: Between(fromInclusive, toExclusive),
    });
    return models.map(toDomain);
  }

  async findForProjectBetween(fromInclusive: Date, toExclusive: Date): Promise<WaterReading[]> {
    const models = await this.scoped.find({ readAt: Between(fromInclusive, toExclusive) });
    return models.map(toDomain);
  }

  async findByClientMutationId(clientMutationId: string): Promise<WaterReading | null> {
    const [model] = await this.scoped.find({ clientMutationId });
    return model ? toDomain(model) : null;
  }

  async save(reading: WaterReading): Promise<WaterReading> {
    const saved = await this.scoped.save(toPersistence(reading));
    return toDomain(saved);
  }
}
