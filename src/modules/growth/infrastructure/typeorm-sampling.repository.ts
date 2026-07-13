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
    const models = await this.scoped.find({ batchId });
    return models
      .map(toDomain)
      .sort((a, b) => a.sampledOn.getTime() - b.sampledOn.getTime());
  }

  async findByClientMutationId(clientMutationId: string): Promise<Sampling | null> {
    const [model] = await this.scoped.find({ clientMutationId });
    return model ? toDomain(model) : null;
  }

  async save(sampling: Sampling): Promise<Sampling> {
    const saved = await this.scoped.save(toPersistence(sampling));
    return toDomain(saved);
  }
}
