import { Inject, Injectable } from '@nestjs/common';
import {
  PROJECT_MEMBERSHIP_REPOSITORY,
  ProjectMembershipRepositoryPort,
} from './ports/project-membership-repository.port';
import { USER_REPOSITORY, UserRepositoryPort } from './ports/user-repository.port';
import { MemberView, toMemberView } from './member-view';

/**
 * `GET /projects/{projectId}/members` (CON-010, FT-011). `RolesGuard` (`OWNER`-only) already ran.
 * Each active membership is joined with its `User` so the owner Members screen can show who the
 * member is (email/name) — the `Membership` row itself holds only ids + role (TASK-047).
 */
@Injectable()
export class ListMembersUseCase {
  constructor(
    @Inject(PROJECT_MEMBERSHIP_REPOSITORY)
    private readonly memberships: ProjectMembershipRepositoryPort,
    @Inject(USER_REPOSITORY)
    private readonly users: UserRepositoryPort,
  ) {}

  async execute(): Promise<MemberView[]> {
    const memberships = await this.memberships.findActiveByProjectId();
    // Members per project are few (an owner + a worker + maybe a partner), so a per-row user lookup
    // on this rarely-hit, owner-only admin endpoint is fine — no batched read-model needed.
    return Promise.all(
      memberships.map(async (membership) =>
        toMemberView(membership, await this.users.findById(membership.userId)),
      ),
    );
  }
}
