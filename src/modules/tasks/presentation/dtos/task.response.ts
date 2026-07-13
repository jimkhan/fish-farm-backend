import { Task } from '../../domain/task.entity';

/** Wire shape of the `Task` schema (contracts/openapi.yaml, CON-029/030). */
export interface TaskResponse {
  id: string;
  projectId: string;
  pondId: string | null;
  title: string;
  recurrenceDays: number | null;
  status: string;
  dueOn: string;
}

export function toTaskResponse(task: Task): TaskResponse {
  return {
    id: task.id,
    projectId: task.projectId,
    pondId: task.pondId,
    title: task.title,
    recurrenceDays: task.recurrenceDays,
    status: task.status,
    dueOn: task.dueOn.toISOString().slice(0, 10),
  };
}
