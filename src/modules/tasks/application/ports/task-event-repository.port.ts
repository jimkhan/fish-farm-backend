import { Task } from '../../domain/task.entity';

/**
 * Unscoped, across every project (TASK-041) — `MissedTaskScheduler` runs on a timer, not inside
 * an HTTP request, so there is no `TenantContext` to scope through (the same structural exception
 * as `BatchEventRepositoryPort`/`AlertEventRepositoryPort`).
 */
export interface TaskEventRepositoryPort {
  /** Every task not yet `DONE`/`MISSED` whose due date is on or before `asOf` (UTC day). */
  findDueOrOverdue(asOf: Date): Promise<Task[]>;
  save(task: Task): Promise<Task>;
}

export const TASK_EVENT_REPOSITORY = 'TaskEventRepositoryPort';
