import { TaskLog } from '../../domain/task-log.entity';

/** Tenant-scoped (ADR-006). */
export interface TaskLogRepositoryPort {
  findByClientMutationId(clientMutationId: string): Promise<TaskLog | null>;
  save(taskLog: TaskLog): Promise<TaskLog>;
}

export const TASK_LOG_REPOSITORY = 'TaskLogRepositoryPort';
