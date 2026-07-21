import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SyncMutation } from '../domain/sync-mutation.entity';
import { SyncMutationRepositoryPort } from '../application/ports/sync-mutation-repository.port';
import { toDomain, toPersistence } from './persistence/sync-mutation.mapper';
import { SyncMutationPersistenceModel } from './persistence/sync-mutation.persistence-model';

/** Unscoped (global) — see `SyncMutationRepositoryPort`'s doc comment. */
@Injectable()
export class TypeOrmSyncMutationRepository implements SyncMutationRepositoryPort {
  constructor(
    @InjectRepository(SyncMutationPersistenceModel)
    private readonly repository: Repository<SyncMutationPersistenceModel>,
  ) {}

  async findByClientMutationId(clientMutationId: string): Promise<SyncMutation | null> {
    const model = await this.repository.findOne({ where: { clientMutationId } });
    return model ? toDomain(model) : null;
  }

  async save(mutation: SyncMutation): Promise<SyncMutation> {
    const saved = await this.repository.save(toPersistence(mutation));
    return toDomain(saved);
  }
}
