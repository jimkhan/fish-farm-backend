import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { NotFoundError, ValidationError } from '../../../shared-kernel/errors/domain-error';
import { TenantContext } from '../../../shared-kernel/tenant/tenant-context';
import { POND_REPOSITORY, PondRepositoryPort } from '../../ponds/application/ports/pond-repository.port';
import {
  PROJECT_REPOSITORY,
  ProjectRepositoryPort,
} from '../../projects/application/ports/project-repository.port';
import { Task } from '../domain/task.entity';
import { TASK_REPOSITORY, TaskRepositoryPort } from './ports/task-repository.port';

export interface CreateTaskInput {
  readonly title: string;
  readonly pondId?: string;
  readonly recurrenceDays?: number;
}

/**
 * `POST /projects/{projectId}/tasks` (CON-030, FT-067, AC-134). Owner-only per the contract's
 * own description ("OWNER"), gated by a new `canManageTasks` capability. No closed-project write
 * guard here — unlike every other project-owned module this session, MOD-12's own R1…R10 list
 * (module doc §2.4) never states one for tasks; not invented.
 */
@Injectable()
export class CreateTaskUseCase {
  constructor(
    @Inject(TASK_REPOSITORY) private readonly tasks: TaskRepositoryPort,
    @Inject(POND_REPOSITORY) private readonly ponds: PondRepositoryPort,
    @Inject(PROJECT_REPOSITORY) private readonly projects: ProjectRepositoryPort,
    private readonly tenant: TenantContext,
  ) {}

  async execute(input: CreateTaskInput): Promise<Task> {
    const project = await this.projects.findById(this.tenant.projectId);
    if (!project) {
      throw new NotFoundError('Project not found.');
    }
    if (input.recurrenceDays !== undefined && input.recurrenceDays <= 0) {
      throw new ValidationError('recurrenceDays must be positive.');
    }

    if (input.pondId !== undefined) {
      const pond = await this.ponds.findById(input.pondId);
      if (!pond) {
        throw new NotFoundError('Pond not found.');
      }
    }

    const task = Task.create({
      id: randomUUID(),
      projectId: this.tenant.projectId,
      pondId: input.pondId ?? null,
      title: input.title,
      recurrenceDays: input.recurrenceDays ?? null,
      today: new Date(),
    });

    return this.tasks.save(task);
  }
}
