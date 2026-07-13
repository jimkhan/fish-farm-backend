import { Injectable } from '@nestjs/common';
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

  async save(log: FeedingLog): Promise<FeedingLog> {
    const saved = await this.scoped.save(toPersistence(log));
    return toDomain(saved);
  }
}
