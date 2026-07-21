import { TaskLog } from '../../domain/task-log.entity';

/** Tenant-scoped (ADR-006). */
export interface TaskLogRepositoryPort {
  findByClientMutationId(clientMutationId: string): Promise<TaskLog | null>;
  /** TASK-037: every completion in the project with `completedAt` in `[fromInclusive,
   * toExclusive)` — the daily summary's `tasksDone` count for the requested date. */
  findForProjectBetween(fromInclusive: Date, toExclusive: Date): Promise<TaskLog[]>;
  save(taskLog: TaskLog): Promise<TaskLog>;
}

export const TASK_LOG_REPOSITORY = 'TaskLogRepositoryPort';
