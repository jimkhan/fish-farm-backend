import { ProjectRole } from '../../../shared-kernel/tenant/membership-resolver.port';

/**
 * Pure domain `ProjectMembership` (TASK-010, MOD-02 §4.3, ERD `PROJECT_MEMBERSHIP`). `status` is
 * not yet in ERD.md's mermaid table (a documented gap this task closes, same pattern as `User`
 * in TASK-008) — a soft `REMOVED` flip rather than a hard delete, so a removed membership row
 * (and its audit trail) is never lost.
 */
export type MembershipStatus = 'ACTIVE' | 'REMOVED';

export interface ProjectMembershipProps {
  readonly id: string;
  readonly userId: string;
  readonly projectId: string;
  readonly role: ProjectRole;
  readonly status: MembershipStatus;
  readonly createdAt: Date;
}

export class ProjectMembership {
  private constructor(private readonly props: ProjectMembershipProps) {}

  static reconstitute(props: ProjectMembershipProps): ProjectMembership {
    return new ProjectMembership(props);
  }

  get id(): string {
    return this.props.id;
  }

  get userId(): string {
    return this.props.userId;
  }

  get projectId(): string {
    return this.props.projectId;
  }

  get role(): ProjectRole {
    return this.props.role;
  }

  get status(): MembershipStatus {
    return this.props.status;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get isActive(): boolean {
    return this.props.status === 'ACTIVE';
  }

  /** Returns a new instance with `status` flipped to `REMOVED` (R7 soft-delete, MOD-02 §4.3). */
  remove(): ProjectMembership {
    return new ProjectMembership({ ...this.props, status: 'REMOVED' });
  }
}
