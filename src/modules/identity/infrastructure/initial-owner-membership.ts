import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TransactionContext } from '../../../platform/persistence/transaction-context';
import { InitialOwnerMembershipPort } from '../application/ports/initial-owner-membership.port';
import { ProjectMembershipPersistenceModel } from './persistence/project-membership.persistence-model';

/**
 * TASK-011 implementation of `InitialOwnerMembershipPort`. Joins the caller's ambient audit
 * transaction (via `TransactionContext`, same mechanism `ScopedRepository` uses) so the new
 * project row and its OWNER membership commit or roll back together (MOD-03 §4.4).
 */
@Injectable()
export class InitialOwnerMembership implements InitialOwnerMembershipPort {
  constructor(
    @InjectRepository(ProjectMembershipPersistenceModel)
    private readonly repository: Repository<ProjectMembershipPersistenceModel>,
    private readonly transactions: TransactionContext,
  ) {}

  async createForNewProject(userId: string, projectId: string): Promise<void> {
    const manager = this.transactions.manager;
    const repo = manager ? manager.getRepository(ProjectMembershipPersistenceModel) : this.repository;
    await repo.save({ userId, projectId, role: 'OWNER', status: 'ACTIVE' });
  }
}
