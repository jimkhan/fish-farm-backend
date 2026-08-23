import { Inject, Injectable } from '@nestjs/common';
import { NotFoundError } from '../../../shared-kernel/errors/domain-error';
import { TASK_REPOSITORY, TaskRepositoryPort } from './ports/task-repository.port';

/**
 * `DELETE /projects/{projectId}/tasks/{taskId}` — Owner-only (`canManageTasks`). Removes the
 * task definition so it no longer appears as due/missed/scheduled.
 */
@Injectable()
export class DeleteTaskUseCase {
  constructor(@Inject(TASK_REPOSITORY) private readonly tasks: TaskRepositoryPort) {}

  async execute(taskId: string): Promise<void> {
    const existing = await this.tasks.findById(taskId);
    if (!existing) {
      throw new NotFoundError('Task not found.');
    }
    const deleted = await this.tasks.deleteById(taskId);
    if (!deleted) {
      throw new NotFoundError('Task not found.');
    }
  }
}
