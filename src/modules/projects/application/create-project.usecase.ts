import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Optional } from '@nestjs/common';
import { ProjectCreated } from '@fish-farm/shared';
import {
  INITIAL_OWNER_MEMBERSHIP,
  InitialOwnerMembershipPort,
} from '../../identity/application/ports/initial-owner-membership.port';
import { DomainEventBus } from '../../../platform/events/domain-event-bus';
import { ValidationError } from '../../../shared-kernel/errors/domain-error';
import { LandUnit, Project } from '../domain/project.entity';
import {
  PROVISION_FIRST_POND,
  ProvisionFirstPondInput,
  ProvisionFirstPondPort,
} from '../domain/provision-first-pond.port';
import { PROJECT_REPOSITORY, ProjectRepositoryPort } from './ports/project-repository.port';

export interface CreateProjectInput {
  readonly name: string;
  readonly siteLat: number;
  readonly siteLng: number;
  readonly address?: string;
  readonly landUnit?: LandUnit;
  readonly firstPond?: ProvisionFirstPondInput;
}

/**
 * `POST /projects` (CON-007, FT-012, AC-030/032). Any authenticated user may create a project —
 * this is how a user becomes an Owner in the first place (human-confirmed; roles are per-project,
 * ADR-005, so there is no pre-existing scope to gate creation against).
 *
 * `ProvisionFirstPondPort` is `@Optional()` — mirrors `ProjectScopeGuard`'s pre-MOD-02 pattern
 * (TASK-004): the app boots even before MOD-04 binds an implementation. A `firstPond` request
 * with no adapter bound fails closed (not silently ignored) rather than pretending to honor it.
 */
@Injectable()
export class CreateProjectUseCase {
  constructor(
    @Inject(PROJECT_REPOSITORY) private readonly projects: ProjectRepositoryPort,
    @Inject(INITIAL_OWNER_MEMBERSHIP) private readonly ownerMembership: InitialOwnerMembershipPort,
    private readonly events: DomainEventBus,
    @Optional()
    @Inject(PROVISION_FIRST_POND)
    private readonly provisionFirstPond: ProvisionFirstPondPort | null = null,
  ) {}

  async execute(userId: string, input: CreateProjectInput): Promise<Project> {
    const project = Project.reconstitute({
      id: randomUUID(),
      name: input.name,
      siteLat: input.siteLat,
      siteLng: input.siteLng,
      address: input.address ?? null,
      currency: 'BDT', // ADR-018: not a user choice in v1, regardless of what the client sends
      landUnit: input.landUnit ?? 'BIGHA',
      status: 'ACTIVE',
      createdAt: new Date(),
    });
    const saved = await this.projects.save(project);

    // Both joins below share the same request transaction as `save()` (AuditInterceptor,
    // TASK-005) — either failing rolls the project insert back too (R6 atomicity, AC-032).
    await this.ownerMembership.createForNewProject(userId, saved.id);

    if (input.firstPond) {
      if (!this.provisionFirstPond) {
        throw new ValidationError('First pond details are invalid.');
      }
      await this.provisionFirstPond.create(saved.id, input.firstPond);
    }

    const event: ProjectCreated = {
      name: 'ProjectCreated',
      eventId: randomUUID(),
      occurredAt: new Date(),
      projectId: saved.id,
      ownerId: userId,
    };
    await this.events.publish(event);

    return saved;
  }
}
