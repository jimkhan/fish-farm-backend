import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { NotFoundError } from '../../../shared-kernel/errors/domain-error';
import { TenantContext } from '../../../shared-kernel/tenant/tenant-context';
import { TaskLog } from '../domain/task-log.entity';
import { TASK_LOG_REPOSITORY, TaskLogRepositoryPort } from './ports/task-log-repository.port';
import { TASK_REPOSITORY, TaskRepositoryPort } from './ports/task-repository.port';

export interface CompleteTaskInput {
  readonly completedAt: Date;
  readonly photoUrl?: string;
  readonly clientMutationId: string;
}

/**
 * `POST /projects/{projectId}/tasks/{taskId}/logs` (CON-031, FT-068, AC-134, R2). Operational
 * write, gated the same as mortality/stocking/readings (`canWrite`) — Worker mobile completes
 * tasks (module doc §2.3). Idempotent by `client_mutation_id` (ADR-010, ERD `TASK_LOG.
 * client_mutation_id UK`), same pattern as every other offline-syncable log this session.
 * Recurring tasks roll their due date forward (`Task.complete`); one-off tasks become terminally
 * `DONE`.
 */
@Injectable()
export class CompleteTaskUseCase {
  constructor(
    @Inject(TASK_LOG_REPOSITORY) private readonly taskLogs: TaskLogRepositoryPort,
    @Inject(TASK_REPOSITORY) private readonly tasks: TaskRepositoryPort,
    private readonly tenant: TenantContext,
  ) {}

  async execute(taskId: string, input: CompleteTaskInput): Promise<TaskLog> {
    const task = await this.tasks.findById(taskId);
    if (!task) {
      throw new NotFoundError('Task not found.');
    }

    const existing = await this.taskLogs.findByClientMutationId(input.clientMutationId);
    if (existing) {
      return existing;
    }

    const taskLog = TaskLog.reconstitute({
      id: randomUUID(),
      projectId: this.tenant.projectId,
      taskId,
      completedAt: input.completedAt,
      photoUrl: input.photoUrl ?? null,
      clientMutationId: input.clientMutationId,
    });
    const savedLog = await this.taskLogs.save(taskLog);

    await this.tasks.save(task.complete(input.completedAt));

    return savedLog;
  }
}
