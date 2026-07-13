import { Inject, Injectable } from '@nestjs/common';
import { NotFoundError } from '../../../shared-kernel/errors/domain-error';
import { TenantContext } from '../../../shared-kernel/tenant/tenant-context';
import { Project } from '../domain/project.entity';
import { PROJECT_REPOSITORY, ProjectRepositoryPort } from './ports/project-repository.port';

/** `GET /projects/{projectId}` (CON-008, AC-033). Member-only (any role) — `ProjectScopeGuard` already ran. */
@Injectable()
export class GetProjectUseCase {
  constructor(
    @Inject(PROJECT_REPOSITORY) private readonly projects: ProjectRepositoryPort,
    private readonly tenant: TenantContext,
  ) {}

  async execute(): Promise<Project> {
    const project = await this.projects.findById(this.tenant.projectId);
    if (!project) {
      throw new NotFoundError('Project not found.');
    }
    return project;
  }
}
