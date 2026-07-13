import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TransactionContext } from '../../../platform/persistence/transaction-context';
import {
  ProvisionFirstPondInput,
  ProvisionFirstPondPort,
} from '../../projects/domain/provision-first-pond.port';
import { PondPersistenceModel } from './persistence/pond.persistence-model';

/**
 * TASK-018 implementation of MOD-03's `ProvisionFirstPondPort` (AC-032/068). Like
 * `InitialOwnerMembership` (TASK-011), this writes a `PondPersistenceModel` for an explicit,
 * caller-given `projectId` rather than via `ScopedRepository`/`TenantContext` — no tenant scope
 * exists yet for a project that doesn't exist until `CreateProjectUseCase`'s transaction commits.
 * Joins that same ambient transaction (`TransactionContext`) so a failure here rolls the project
 * insert back too.
 */
@Injectable()
export class ProvisionFirstPondAdapter implements ProvisionFirstPondPort {
  constructor(
    @InjectRepository(PondPersistenceModel)
    private readonly repository: Repository<PondPersistenceModel>,
    private readonly transactions: TransactionContext,
  ) {}

  async create(projectId: string, firstPond: ProvisionFirstPondInput): Promise<void> {
    const manager = this.transactions.manager;
    const repo = manager ? manager.getRepository(PondPersistenceModel) : this.repository;
    await repo.save({
      id: randomUUID(),
      projectId,
      name: firstPond.name,
      area: firstPond.area,
      depthM: firstPond.depthM ?? null,
      notes: firstPond.notes ?? null,
    });
  }
}
