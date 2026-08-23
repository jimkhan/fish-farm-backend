import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { NotFoundError, ValidationError } from '../../../shared-kernel/errors/domain-error';
import { TenantContext } from '../../../shared-kernel/tenant/tenant-context';
import {
  MEMBERSHIP_DIRECTORY,
  MembershipDirectoryPort,
} from '../../identity/application/ports/membership-directory.port';
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
  readonly dueOn?: string;
  readonly assigneeUserId?: string;
}

/**
 * `POST /projects/{projectId}/tasks` (CON-030, FT-067, AC-134). Owner-only per the contract's
 * own description ("OWNER"), gated by `canManageTasks`. Optional `dueOn` / `assigneeUserId`
 * (assignee must be ACTIVE OWNER or WORKER on this project). Completion stays open to any
 * `canWrite` role — assignee is informational.
 */
@Injectable()
export class CreateTaskUseCase {
  constructor(
    @Inject(TASK_REPOSITORY) private readonly tasks: TaskRepositoryPort,
    @Inject(POND_REPOSITORY) private readonly ponds: PondRepositoryPort,
    @Inject(PROJECT_REPOSITORY) private readonly projects: ProjectRepositoryPort,
    @Inject(MEMBERSHIP_DIRECTORY) private readonly memberships: MembershipDirectoryPort,
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

    const today = new Date();
    let dueOn: Date | undefined;
    if (input.dueOn !== undefined) {
      dueOn = parseUtcDateOnly(input.dueOn);
      if (Number.isNaN(dueOn.getTime())) {
        throw new ValidationError('dueOn must be a valid date (YYYY-MM-DD).');
      }
      if (startOfUtcDay(dueOn) < startOfUtcDay(today)) {
        throw new ValidationError('dueOn cannot be in the past.');
      }
    }

    let assigneeUserId: string | null = null;
    if (input.assigneeUserId !== undefined) {
      const memberships = await this.memberships.findActiveByUserId(input.assigneeUserId);
      const here = memberships.find((m) => m.projectId === this.tenant.projectId);
      if (!here) {
        throw new NotFoundError('Assignee is not an active member of this project.');
      }
      if (here.role !== 'OWNER' && here.role !== 'WORKER') {
        throw new ValidationError('Assignee must be an Owner or Worker on this project.');
      }
      assigneeUserId = input.assigneeUserId;
    }

    const task = Task.create({
      id: randomUUID(),
      projectId: this.tenant.projectId,
      pondId: input.pondId ?? null,
      title: input.title,
      recurrenceDays: input.recurrenceDays ?? null,
      today,
      dueOn,
      assigneeUserId,
    });

    return this.tasks.save(task);
  }
}

function parseUtcDateOnly(isoDate: string): Date {
  // Force UTC midnight so calendar dates don't shift with the server timezone.
  const [y, m, d] = isoDate.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}
