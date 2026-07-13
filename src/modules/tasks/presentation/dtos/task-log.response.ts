import { TaskLog } from '../../domain/task-log.entity';

/** Wire shape of the `TaskLog` schema (contracts/openapi.yaml, CON-031). */
export interface TaskLogResponse {
  id: string;
  projectId: string;
  taskId: string;
  completedAt: string;
  photoUrl: string | null;
}

export function toTaskLogResponse(taskLog: TaskLog): TaskLogResponse {
  return {
    id: taskLog.id,
    projectId: taskLog.projectId,
    taskId: taskLog.taskId,
    completedAt: taskLog.completedAt.toISOString(),
    photoUrl: taskLog.photoUrl,
  };
}
