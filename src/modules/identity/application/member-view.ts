import { ProjectRole } from '../../../shared-kernel/tenant/membership-resolver.port';
import { ProjectMembership } from '../domain/project-membership.entity';
import { User } from '../domain/user.entity';

/**
 * Enriched member row for the owner-only Members admin UI (CON-010/011, TASK-047): a membership
 * plus the member's identity (email/name), joined from the `User` by `userId`. The `Membership`
 * wire shape carries only ids/role, so the admin list would otherwise show no one's name — this
 * view supplies the identity the screen needs. A freshly-invited account not yet signed up has
 * `name` defaulting to its email (see `InviteMemberUseCase`).
 */
export interface MemberView {
  id: string;
  userId: string;
  projectId: string;
  role: ProjectRole;
  email: string;
  name: string;
}

export function toMemberView(membership: ProjectMembership, user: User | null): MemberView {
  return {
    id: membership.id,
    userId: membership.userId,
    projectId: membership.projectId,
    role: membership.role,
    email: user?.email ?? '',
    name: user?.name ?? user?.email ?? '',
  };
}
