import { PondAction } from '../../domain/pond-action.entity';
import { PondActionPersistenceModel } from './pond-action.persistence-model';

export function toDomain(model: PondActionPersistenceModel): PondAction {
  return PondAction.reconstitute({
    id: model.id,
    projectId: model.projectId,
    pondId: model.pondId,
    actionType: model.actionType,
    performedAt: model.performedAt,
    notes: model.notes,
    clientMutationId: model.clientMutationId,
    createdAt: model.createdAt,
  });
}

export function toPersistence(entity: PondAction): PondActionPersistenceModel {
  const model = new PondActionPersistenceModel();
  model.id = entity.id;
  model.projectId = entity.projectId;
  model.pondId = entity.pondId;
  model.actionType = entity.actionType;
  model.performedAt = entity.performedAt;
  model.notes = entity.notes;
  model.clientMutationId = entity.clientMutationId;
  model.createdAt = entity.createdAt;
  return model;
}
