import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  MembershipResolverPort,
  ProjectMembershipView,
} from '../../../shared-kernel/tenant/membership-resolver.port';
import { ProjectMembership } from '../domain/project-membership.entity';
import { MembershipDirectoryPort } from '../application/ports/membership-directory.port';
import { ProjectMembersDirectoryPort } from '../application/ports/project-members-directory.port';
import { toDomain } from './persistence/project-membership.mapper';
import { ProjectMembershipPersistenceModel } from './persistence/project-membership.persistence-model';

/**
 * Cross-project membership reads (TASK-010/015, MOD-02 §4.6). Implements MOD-01's
 * `MembershipResolverPort` (bound globally so `ProjectScopeGuard` stops fail-closed), this
 * module's own `MembershipDirectoryPort` (full rows for `GET /me`, by user), AND
 * `ProjectMembersDirectoryPort` (by project, for MOD-09's `RecipientResolver`) — all three are
 * the same underlying query shape, just different keys/return shapes, and all are structurally
 * pre-scope / cross-project, so none goes through `ScopedRepository` (MOD-01 §4.6, the sanctioned
 * exception mirrored by each port's own doc comment).
 */
@Injectable()
export class MembershipResolver
  implements MembershipResolverPort, MembershipDirectoryPort, ProjectMembersDirectoryPort
{
  constructor(
    @InjectRepository(ProjectMembershipPersistenceModel)
    private readonly repository: Repository<ProjectMembershipPersistenceModel>,
  ) {}

  async resolve(userId: string): Promise<ProjectMembershipView[]> {
    const models = await this.repository.find({ where: { userId, status: 'ACTIVE' } });
    return models.map((m) => ({ projectId: m.projectId, role: m.role }));
  }

  async findActiveByUserId(userId: string): Promise<ProjectMembership[]> {
    const models = await this.repository.find({ where: { userId, status: 'ACTIVE' } });
    return models.map(toDomain);
  }

  async findActiveByProjectId(projectId: string): Promise<ProjectMembership[]> {
    const models = await this.repository.find({ where: { projectId, status: 'ACTIVE' } });
    return models.map(toDomain);
  }
}
