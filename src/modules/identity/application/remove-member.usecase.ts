import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { MemberRemoved } from '@fish-farm/shared';
import { NotFoundError } from '../../../shared-kernel/errors/domain-error';
import { DomainEventBus } from '../../../platform/events/domain-event-bus';
import { LastOwnerError } from '../domain/identity-errors';
import {
  PROJECT_MEMBERSHIP_REPOSITORY,
  ProjectMembershipRepositoryPort,
} from './ports/project-membership-repository.port';

/**
 * `DELETE /projects/{projectId}/members/{membershipId}` (CON-012, FT-011, AC-027, R7). `RolesGuard`
 * (`OWNER`-only) already ran (AC-023). Soft-removes — `status` flips to `REMOVED`, never a hard
 * delete (MOD-02 §4.3, matches `User`'s soft-deactivate design).
 */
@Injectable()
export class RemoveMemberUseCase {
  constructor(
    @Inject(PROJECT_MEMBERSHIP_REPOSITORY)
    private readonly memberships: ProjectMembershipRepositoryPort,
    private readonly events: DomainEventBus,
  ) {}

  async execute(membershipId: string): Promise<void> {
    const membership = await this.memberships.findById(membershipId);
    // `findById` is tenant-scoped (ScopedRepository) — a membership belonging to another project
    // is indistinguishable from a nonexistent one, so this never discloses cross-project existence.
    if (!membership?.isActive) {
      throw new NotFoundError('Membership not found.');
    }

    if (membership.role === 'OWNER') {
      const activeOwners = await this.memberships.countActiveOwners();
      if (activeOwners <= 1) {
        throw new LastOwnerError();
      }
    }

    const removed = membership.remove();
    await this.memberships.save(removed);

    const event: MemberRemoved = {
      name: 'MemberRemoved',
      eventId: randomUUID(),
      occurredAt: new Date(),
      projectId: removed.projectId,
      membershipId: removed.id,
      userId: removed.userId,
      role: removed.role,
    };
    await this.events.publish(event);
  }
}
