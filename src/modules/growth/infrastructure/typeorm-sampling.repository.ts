import { Injectable } from '@nestjs/common';
import { ScopedRepository } from '../../../shared-kernel/tenant/scoped-repository';
import { Sampling } from '../domain/sampling.entity';
import { SamplingRepositoryPort } from '../application/ports/sampling-repository.port';
import { SamplingPersistenceModel } from './persistence/sampling.persistence-model';
import { toDomain, toPersistence } from './persistence/sampling.mapper';

@Injectable()
export class TypeOrmSamplingRepository implements SamplingRepositoryPort {
  constructor(private readonly scoped: ScopedRepository<SamplingPersistenceModel>) {}

  async findForBatch(batchId: string): Promise<Sampling[]> {
    // Ordered in SQL, not in memory — growth curves depend on chronological order, and sorting
    // the whole batch's history client-side scales with the season, not with what's needed.
    const models = await this.scoped.find({ batchId }, { order: { sampledOn: 'ASC' } });
    return models.map(toDomain);
  }

  async findByClientMutationId(clientMutationId: string): Promise<Sampling | null> {
    const model = await this.scoped.findOne({ clientMutationId });
    return model ? toDomain(model) : null;
  }

  async save(sampling: Sampling): Promise<Sampling> {
    const saved = await this.scoped.save(toPersistence(sampling));
    return toDomain(saved);
  }
}
