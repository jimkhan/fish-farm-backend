import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { NotFoundError } from '../../../shared-kernel/errors/domain-error';
import { TenantContext } from '../../../shared-kernel/tenant/tenant-context';
import { POND_REPOSITORY, PondRepositoryPort } from '../../ponds/application/ports/pond-repository.port';
import {
  PROJECT_REPOSITORY,
  ProjectRepositoryPort,
} from '../../projects/application/ports/project-repository.port';
import { ProjectClosedError } from '../../projects/domain/project-errors';
import { PondAction, PondActionType } from '../domain/pond-action.entity';
import { POND_ACTION_REPOSITORY, PondActionRepositoryPort } from './ports/pond-action-repository.port';

export interface LogPondActionInput {
  readonly actionType: PondActionType;
  readonly performedAt: Date;
  readonly notes?: string;
  readonly clientMutationId: string;
}

/**
 * Logs a chain-drag or aeration action against a pond (TASK-025, MOD-06 F4, AC-088, ERD
 * `POND_ACTION`). Reached exclusively through `/sync` (`MutationDispatcher`'s `POND_ACTION`
 * case) — no direct REST endpoint exists yet (CON-050 is reserved, not defined; BACKLOG marks it
 * "if UI needs" and no web/mobile UI needing one exists in this task's scope). Idempotent by
 * `clientMutationId` (ADR-010), same pattern as `RecordReadingUseCase`/`LogMortalityUseCase`.
 * Publishes no event — `PondActionLogged` has no built consumer anywhere yet (unlike
 * `WaterThresholdBreached`/`WaterEmergencyRaised`, both real MOD-09 alert-engine inputs); adding
 * one now would be dead work.
 */
@Injectable()
export class LogPondActionUseCase {
  constructor(
    @Inject(POND_ACTION_REPOSITORY) private readonly pondActions: PondActionRepositoryPort,
    @Inject(POND_REPOSITORY) private readonly ponds: PondRepositoryPort,
    @Inject(PROJECT_REPOSITORY) private readonly projects: ProjectRepositoryPort,
    private readonly tenant: TenantContext,
  ) {}

  async execute(pondId: string, input: LogPondActionInput): Promise<PondAction> {
    const project = await this.projects.findById(this.tenant.projectId);
    if (!project) {
      throw new NotFoundError('Project not found.');
    }
    if (project.isClosed) {
      throw new ProjectClosedError();
    }

    const pond = await this.ponds.findById(pondId);
    if (!pond) {
      throw new NotFoundError('Pond not found.');
    }

    const existing = await this.pondActions.findByClientMutationId(input.clientMutationId);
    if (existing) {
      return existing;
    }

    const action = PondAction.reconstitute({
      id: randomUUID(),
      projectId: this.tenant.projectId,
      pondId,
      actionType: input.actionType,
      performedAt: input.performedAt,
      notes: input.notes ?? null,
      clientMutationId: input.clientMutationId,
      createdAt: new Date(),
    });
    return this.pondActions.save(action);
  }
}
