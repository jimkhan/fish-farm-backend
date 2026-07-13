import { Inject, Injectable } from '@nestjs/common';
import { UnauthenticatedError } from '../../../shared-kernel/errors/domain-error';
import { MeResult } from './me.result';
import { MEMBERSHIP_DIRECTORY, MembershipDirectoryPort } from './ports/membership-directory.port';
import { USER_REPOSITORY, UserRepositoryPort } from './ports/user-repository.port';

/** `GET /me` (CON-005, FT-010, AC-021). Lists only the caller's own memberships. */
@Injectable()
export class GetMeUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepositoryPort,
    @Inject(MEMBERSHIP_DIRECTORY) private readonly directory: MembershipDirectoryPort,
  ) {}

  async execute(userId: string): Promise<MeResult> {
    const user = await this.users.findById(userId);
    if (!user || !user.isActive) {
      // Defensive — AuthMiddleware (TASK-008) already rejects a deactivated/missing sub before
      // any handler runs, so this path should be unreachable in practice.
      throw new UnauthenticatedError();
    }

    const memberships = await this.directory.findActiveByUserId(userId);
    return {
      user: { id: user.id, email: user.email, name: user.name },
      memberships: memberships.map((m) => ({
        id: m.id,
        userId: m.userId,
        projectId: m.projectId,
        role: m.role,
      })),
    };
  }
}
