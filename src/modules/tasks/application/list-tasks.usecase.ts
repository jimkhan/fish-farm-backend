import { Inject, Injectable } from '@nestjs/common';
import { Task } from '../domain/task.entity';
import { TASK_REPOSITORY, TaskRepositoryPort } from './ports/task-repository.port';

/**
 * `GET /projects/{projectId}/tasks` (CON-029, AC-134). Any member role — Partner read-only.
 * Recomputes each task's status against "now" at read time (`SCHEDULED→DUE`, `DUE→MISSED`) so the
 * list is always accurate even between `MissedTaskScheduler` ticks — the scheduler's own job is
 * to persist that transition and raise the one-time `MissedTask` alert, not to gate what a read
 * shows.
 */
@Injectable()
export class ListTasksUseCase {
  constructor(@Inject(TASK_REPOSITORY) private readonly tasks: TaskRepositoryPort) {}

  async execute(): Promise<Task[]> {
    const tasks = await this.tasks.findAllInCurrentProject();
    const now = new Date();
    return tasks.map((task) => task.recomputeStatus(now));
  }
}
