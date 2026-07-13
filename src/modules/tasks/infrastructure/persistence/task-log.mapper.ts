import { TaskLog } from '../../domain/task-log.entity';
import { TaskLogPersistenceModel } from './task-log.persistence-model';

export function toDomain(model: TaskLogPersistenceModel): TaskLog {
  return TaskLog.reconstitute({
    id: model.id,
    projectId: model.projectId,
    taskId: model.taskId,
    completedAt: model.completedAt,
    photoUrl: model.photoUrl,
    clientMutationId: model.clientMutationId,
  });
}

export function toPersistence(entity: TaskLog): TaskLogPersistenceModel {
  const model = new TaskLogPersistenceModel();
  model.id = entity.id;
  model.projectId = entity.projectId;
  model.taskId = entity.taskId;
  model.completedAt = entity.completedAt;
  model.photoUrl = entity.photoUrl;
  model.clientMutationId = entity.clientMutationId;
  return model;
}
