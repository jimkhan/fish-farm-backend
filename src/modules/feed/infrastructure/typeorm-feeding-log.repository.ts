import { Injectable } from '@nestjs/common';
import { halfOpenRange } from '../../../platform/persistence/half-open-range';
import { ScopedRepository } from '../../../shared-kernel/tenant/scoped-repository';
import { FeedingLog } from '../domain/feeding-log.entity';
import { FeedingLogRepositoryPort } from '../application/ports/feeding-log-repository.port';
import { FeedingLogPersistenceModel } from './persistence/feeding-log.persistence-model';
import { toDomain, toPersistence } from './persistence/feeding-log.mapper';

@Injectable()
export class TypeOrmFeedingLogRepository implements FeedingLogRepositoryPort {
  constructor(private readonly scoped: ScopedRepository<FeedingLogPersistenceModel>) {}

  async findByClientMutationId(clientMutationId: string): Promise<FeedingLog | null> {
    const [model] = await this.scoped.find({ clientMutationId });
    return model ? toDomain(model) : null;
  }

  async findForProjectBetween(fromInclusive: Date, toExclusive: Date): Promise<FeedingLog[]> {
    const models = await this.scoped.find({ fedAt: halfOpenRange(fromInclusive, toExclusive) });
    return models.map(toDomain);
  }

  async save(log: FeedingLog): Promise<FeedingLog> {
    const saved = await this.scoped.save(toPersistence(log));
    return toDomain(saved);
  }
}
