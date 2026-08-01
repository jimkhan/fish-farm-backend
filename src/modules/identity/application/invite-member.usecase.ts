import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { MemberInvited } from '@fish-farm/shared';
import { DomainEventBus } from '../../../platform/events/domain-event-bus';
import { TenantContext } from '../../../shared-kernel/tenant/tenant-context';
import { ProjectRole } from '../../../shared-kernel/tenant/membership-resolver.port';
import { ProjectMembership } from '../domain/project-membership.entity';
import { WorkerAlreadyAssignedError } from '../domain/identity-errors';
import { MemberView, toMemberView } from './member-view';
import { MEMBERSHIP_DIRECTORY, MembershipDirectoryPort } from './ports/membership-directory.port';
import { PASSWORD_HASHER, PasswordHasherPort } from './ports/password-hasher.port';
import {
  PROJECT_MEMBERSHIP_REPOSITORY,
  ProjectMembershipRepositoryPort,
} from './ports/project-membership-repository.port';
import { USER_REPOSITORY, UserRepositoryPort } from './ports/user-repository.port';
import { generateOpaqueToken } from './token-hash.util';

/**
 * `POST /projects/{projectId}/members` (CON-011, FT-011, AC-024/029, R4/R6/R8/R9-adjacent).
 * `RolesGuard` (`OWNER`-only) already ran before this executes (AC-023) — no role check here.
 */
@Injectable()
export class InviteMemberUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepositoryPort,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasherPort,
    @Inject(MEMBERSHIP_DIRECTORY) private readonly directory: MembershipDirectoryPort,
    @Inject(PROJECT_MEMBERSHIP_REPOSITORY)
    private readonly memberships: ProjectMembershipRepositoryPort,
    private readonly events: DomainEventBus,
    private readonly tenant: TenantContext,
  ) {}

  async execute(email: string, role: ProjectRole): Promise<MemberView> {
    let user = await this.users.findByEmail(email);
    if (!user) {
      // R8: a pending account, scoped to no project until the membership below creates one. The
      // password hash is an unguessable random secret — nobody can log in as this account until
      // the invitee completes TASK-009's password-reset flow, which doubles as the module doc's
      // stated "invite link + self-set password" default without a bespoke invite-token endpoint.
      user = await this.users.create({
        email,
        name: email,
        passwordHash: await this.hasher.hash(generateOpaqueToken()),
      });
    }

    const existingMemberships = await this.directory.findActiveByUserId(user.id);

    // Edge case 9: a duplicate invite of the same user to this project is idempotent.
    const existingHere = existingMemberships.find((m) => m.projectId === this.tenant.projectId);
    if (existingHere) {
      return toMemberView(existingHere, user);
    }

    // R4/AC-024: a user already an active Worker on another project cannot be assigned Worker again.
    if (role === 'WORKER' && existingMemberships.some((m) => m.role === 'WORKER')) {
      throw new WorkerAlreadyAssignedError();
    }

    const membership = ProjectMembership.reconstitute({
      id: randomUUID(),
      userId: user.id,
      projectId: this.tenant.projectId,
      role,
      status: 'ACTIVE',
      createdAt: new Date(),
    });
    const saved = await this.memberships.save(membership);

    const event: MemberInvited = {
      name: 'MemberInvited',
      eventId: randomUUID(),
      occurredAt: new Date(),
      projectId: saved.projectId,
      membershipId: saved.id,
      userId: saved.userId,
      role: saved.role,
    };
    await this.events.publish(event);

    return toMemberView(saved, user);
  }
}
