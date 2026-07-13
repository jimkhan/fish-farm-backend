import { Injectable } from '@nestjs/common';
import { ScopedRepository } from '../../../shared-kernel/tenant/scoped-repository';
import { ProjectMembership } from '../domain/project-membership.entity';
import { ProjectMembershipRepositoryPort } from '../application/ports/project-membership-repository.port';
import { toDomain, toPersistence } from './persistence/project-membership.mapper';
import { ProjectMembershipPersistenceModel } from './persistence/project-membership.persistence-model';

/**
 * Tenant-scoped membership access (TASK-010, ADR-006) — every method is composed with the
 * current request's `TenantContext.projectId` by the underlying `ScopedRepository`, so this
 * class can structurally never read/write another project's memberships.
 */
@Injectable()
export class TypeOrmProjectMembershipRepository implements ProjectMembershipRepositoryPort {
  constructor(
    private readonly scoped: ScopedRepository<ProjectMembershipPersistenceModel>,
  ) {}

  async findActiveByProjectId(): Promise<ProjectMembership[]> {
    const models = await this.scoped.find({ status: 'ACTIVE' });
    return models.map(toDomain);
  }

  async countActiveOwners(): Promise<number> {
    return this.scoped.count({ role: 'OWNER', status: 'ACTIVE' });
  }

  async findById(membershipId: string): Promise<ProjectMembership | null> {
    const model = await this.scoped.findOneById(membershipId);
    return model ? toDomain(model) : null;
  }

  async save(membership: ProjectMembership): Promise<ProjectMembership> {
    const saved = await this.scoped.save(toPersistence(membership));
    return toDomain(saved);
  }
}
