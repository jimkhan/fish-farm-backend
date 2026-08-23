import { Task } from '../../domain/task.entity';

/** Tenant-scoped (ADR-006) — for request-driven reads/writes. */
export interface TaskRepositoryPort {
  findAllInCurrentProject(): Promise<Task[]>;
  findById(taskId: string): Promise<Task | null>;
  save(task: Task): Promise<Task>;
  deleteById(taskId: string): Promise<boolean>;
}

export const TASK_REPOSITORY = 'TaskRepositoryPort';
