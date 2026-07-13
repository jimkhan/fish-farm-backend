import { Injectable } from '@nestjs/common';
import { Between } from 'typeorm';
import { ScopedRepository } from '../../../shared-kernel/tenant/scoped-repository';
import { Mortality } from '../domain/mortality.entity';
import { MortalityRepositoryPort } from '../application/ports/mortality-repository.port';
import { MortalityPersistenceModel } from './persistence/mortality.persistence-model';
import { toDomain, toPersistence } from './persistence/mortality.mapper';

@Injectable()
export class TypeOrmMortalityRepository implements MortalityRepositoryPort {
  constructor(private readonly scoped: ScopedRepository<MortalityPersistenceModel>) {}

  async findByClientMutationId(clientMutationId: string): Promise<Mortality | null> {
    const [model] = await this.scoped.find({ clientMutationId });
    return model ? toDomain(model) : null;
  }

  async findForBatchBetween(
    batchId: string,
    fromInclusive: Date,
    toExclusive: Date,
  ): Promise<Mortality[]> {
    const models = await this.scoped.find({
      batchId,
      occurredAt: Between(fromInclusive, toExclusive),
    });
    return models.map(toDomain);
  }

  async save(mortality: Mortality): Promise<Mortality> {
    const saved = await this.scoped.save(toPersistence(mortality));
    return toDomain(saved);
  }
}
