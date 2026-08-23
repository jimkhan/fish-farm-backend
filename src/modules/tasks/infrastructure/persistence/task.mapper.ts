import { Task } from '../../domain/task.entity';
import { TaskPersistenceModel } from './task.persistence-model';

export function toDomain(model: TaskPersistenceModel): Task {
  return Task.reconstitute({
    id: model.id,
    projectId: model.projectId,
    pondId: model.pondId,
    title: model.title,
    recurrenceDays: model.recurrenceDays,
    status: model.status,
    // TypeORM returns Postgres `date` columns as 'YYYY-MM-DD' strings at runtime, not Date
    // objects — `new Date(...)` normalizes either shape.
    dueOn: new Date(model.dueOn),
    assigneeUserId: model.assigneeUserId,
  });
}

export function toPersistence(entity: Task): TaskPersistenceModel {
  const model = new TaskPersistenceModel();
  model.id = entity.id;
  model.projectId = entity.projectId;
  model.pondId = entity.pondId;
  model.title = entity.title;
  model.recurrenceDays = entity.recurrenceDays;
  model.status = entity.status;
  model.dueOn = entity.dueOn;
  model.assigneeUserId = entity.assigneeUserId;
  return model;
}
