import { Inject, Injectable } from '@nestjs/common';
import {
  MEMBERSHIP_DIRECTORY,
  MembershipDirectoryPort,
} from '../../identity/application/ports/membership-directory.port';
import { PROJECT_REPOSITORY, ProjectListPage, ProjectRepositoryPort } from './ports/project-repository.port';

/**
 * `GET /projects` (CON-006, AC-021-adjacent). No `:projectId` — like `GET /me`, this is a
 * cross-project read of the caller's OWN memberships (any role), not tenant-scoped.
 */
@Injectable()
export class ListProjectsUseCase {
  constructor(
    @Inject(PROJECT_REPOSITORY) private readonly projects: ProjectRepositoryPort,
    @Inject(MEMBERSHIP_DIRECTORY) private readonly directory: MembershipDirectoryPort,
  ) {}

  async execute(userId: string, cursor: string | null, limit: number): Promise<ProjectListPage> {
    const memberships = await this.directory.findActiveByUserId(userId);
    const projectIds = memberships.map((m) => m.projectId);
    if (projectIds.length === 0) {
      return { data: [], nextCursor: null };
    }
    return this.projects.findPage(projectIds, cursor, limit);
  }
}
