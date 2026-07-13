import { Column, Entity, Index } from 'typeorm';
import { BaseProjectOwnedPersistenceModel } from '../../../../platform/persistence/base-project-owned.persistence-model';
import { MembershipStatus } from '../../domain/project-membership.entity';
import { ProjectRole } from '../../../../shared-kernel/tenant/membership-resolver.port';

/**
 * `project_membership` table (TASK-010, ERD `PROJECT_MEMBERSHIP` + `status`). Genuinely
 * project-owned (ADR-006) — extends the base so `ScopedRepository` composes `project_id`
 * automatically for every in-project read/write (list members, last-owner count, remove).
 * Cross-project reads (a user's memberships across ALL projects) bypass this via the separate
 * `MembershipDirectoryPort`/`MembershipResolverPort` infra, the sanctioned pre-scope exception.
 */
@Entity('project_membership')
export class ProjectMembershipPersistenceModel extends BaseProjectOwnedPersistenceModel {
  @Index()
  @Column('uuid', { name: 'user_id' })
  userId!: string;

  @Column('varchar')
  role!: ProjectRole;

  @Column('varchar', { default: 'ACTIVE' })
  status!: MembershipStatus;

  @Column('timestamptz', { name: 'created_at', default: () => 'now()' })
  createdAt!: Date;
}
