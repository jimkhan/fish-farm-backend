import { Injectable } from '@nestjs/common';
import { ScopedRepository } from '../../../shared-kernel/tenant/scoped-repository';
import { PondAction } from '../domain/pond-action.entity';
import { PondActionRepositoryPort } from '../application/ports/pond-action-repository.port';
import { PondActionPersistenceModel } from './persistence/pond-action.persistence-model';
import { toDomain, toPersistence } from './persistence/pond-action.mapper';

@Injectable()
export class TypeOrmPondActionRepository implements PondActionRepositoryPort {
  constructor(private readonly scoped: ScopedRepository<PondActionPersistenceModel>) {}

  async findByClientMutationId(clientMutationId: string): Promise<PondAction | null> {
    const [model] = await this.scoped.find({ clientMutationId });
    return model ? toDomain(model) : null;
  }

  async save(action: PondAction): Promise<PondAction> {
    const saved = await this.scoped.save(toPersistence(action));
    return toDomain(saved);
  }
}
