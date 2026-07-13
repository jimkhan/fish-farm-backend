import { Inject, Injectable } from '@nestjs/common';
import { ProjectMembership } from '../domain/project-membership.entity';
import {
  PROJECT_MEMBERSHIP_REPOSITORY,
  ProjectMembershipRepositoryPort,
} from './ports/project-membership-repository.port';

/** `GET /projects/{projectId}/members` (CON-010, FT-011). `RolesGuard` (`OWNER`-only) already ran. */
@Injectable()
export class ListMembersUseCase {
  constructor(
    @Inject(PROJECT_MEMBERSHIP_REPOSITORY)
    private readonly memberships: ProjectMembershipRepositoryPort,
  ) {}

  async execute(): Promise<ProjectMembership[]> {
    return this.memberships.findActiveByProjectId();
  }
}
