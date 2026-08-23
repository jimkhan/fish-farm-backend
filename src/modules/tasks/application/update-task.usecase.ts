import { Inject, Injectable } from '@nestjs/common';
import { NotFoundError, ValidationError } from '../../../shared-kernel/errors/domain-error';
import { TenantContext } from '../../../shared-kernel/tenant/tenant-context';
import {
  MEMBERSHIP_DIRECTORY,
  MembershipDirectoryPort,
} from '../../identity/application/ports/membership-directory.port';
import { POND_REPOSITORY, PondRepositoryPort } from '../../ponds/application/ports/pond-repository.port';
import { Task } from '../domain/task.entity';
import { TASK_REPOSITORY, TaskRepositoryPort } from './ports/task-repository.port';

export interface UpdateTaskInput {
  readonly taskId: string;
  readonly title?: string;
  readonly pondId?: string | null;
  readonly recurrenceDays?: number | null;
  readonly dueOn?: string;
  readonly assigneeUserId?: string | null;
}

/**
 * `PATCH /projects/{projectId}/tasks/{taskId}` — Owner-only (`canManageTasks`). Partial update
 * of a task definition (title, pond, recurrence, due date, assignee).
 */
@Injectable()
export class UpdateTaskUseCase {
  constructor(
    @Inject(TASK_REPOSITORY) private readonly tasks: TaskRepositoryPort,
    @Inject(POND_REPOSITORY) private readonly ponds: PondRepositoryPort,
    @Inject(MEMBERSHIP_DIRECTORY) private readonly memberships: MembershipDirectoryPort,
    private readonly tenant: TenantContext,
  ) {}

  async execute(input: UpdateTaskInput): Promise<Task> {
    const task = await this.tasks.findById(input.taskId);
    if (!task) {
      throw new NotFoundError('Task not found.');
    }

    if (input.title !== undefined && input.title.trim() === '') {
      throw new ValidationError('title must not be empty.');
    }
    if (input.recurrenceDays !== undefined && input.recurrenceDays !== null && input.recurrenceDays <= 0) {
      throw new ValidationError('recurrenceDays must be positive.');
    }

    if (input.pondId) {
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

    let assigneeUserId: string | null | undefined = input.assigneeUserId;
    if (input.assigneeUserId) {
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

    const updated = task.update(
      {
        title: input.title?.trim(),
        pondId: input.pondId,
        recurrenceDays: input.recurrenceDays,
        dueOn,
        assigneeUserId,
      },
      today,
    );

    return this.tasks.save(updated);
  }
}

function parseUtcDateOnly(isoDate: string): Date {
  const [y, m, d] = isoDate.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}
