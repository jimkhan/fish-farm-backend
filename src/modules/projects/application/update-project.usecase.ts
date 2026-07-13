import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { ProjectClosed } from '@fish-farm/shared';
import { NotFoundError } from '../../../shared-kernel/errors/domain-error';
import { DomainEventBus } from '../../../platform/events/domain-event-bus';
import { TenantContext } from '../../../shared-kernel/tenant/tenant-context';
import { Project, ProjectStatus } from '../domain/project.entity';
import { ProjectClosedError } from '../domain/project-errors';
import { PROJECT_REPOSITORY, ProjectRepositoryPort } from './ports/project-repository.port';

export interface UpdateProjectInput {
  readonly name?: string;
  readonly address?: string;
  readonly status?: ProjectStatus;
}

/**
 * `PATCH /projects/{projectId}` (CON-009, FT-012, AC-036). `RolesGuard` (`OWNER`-only, via
 * `canManageProjectSettings`) and `ProjectScopeGuard` already ran.
 *
 * R4: a `CLOSED` project is read-only. The sole exception is reopening it — a request whose
 * *only* field is `status: 'ACTIVE'` — otherwise (including a redundant re-close) any write is
 * rejected (MOD-03 §2.6 error table: "Reopen (owner) or discard").
 */
@Injectable()
export class UpdateProjectUseCase {
  constructor(
    @Inject(PROJECT_REPOSITORY) private readonly projects: ProjectRepositoryPort,
    private readonly events: DomainEventBus,
    private readonly tenant: TenantContext,
  ) {}

  async execute(input: UpdateProjectInput): Promise<Project> {
    const project = await this.projects.findById(this.tenant.projectId);
    if (!project) {
      throw new NotFoundError('Project not found.');
    }

    if (project.isClosed) {
      const isReopen = input.status === 'ACTIVE';
      const changesOtherFields = input.name !== undefined || input.address !== undefined;
      if (!isReopen || changesOtherFields) {
        throw new ProjectClosedError();
      }
    }

    const updated = project.withUpdate(input);
    const saved = await this.projects.save(updated);

    if (input.status === 'CLOSED' && !project.isClosed) {
      const event: ProjectClosed = {
        name: 'ProjectClosed',
        eventId: randomUUID(),
        occurredAt: new Date(),
        projectId: saved.id,
      };
      await this.events.publish(event);
    }

    return saved;
  }
}
