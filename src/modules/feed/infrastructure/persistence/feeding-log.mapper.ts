import { FeedingLog } from '../../domain/feeding-log.entity';
import { FeedingLogPersistenceModel } from './feeding-log.persistence-model';

export function toDomain(model: FeedingLogPersistenceModel): FeedingLog {
  return FeedingLog.reconstitute({
    id: model.id,
    projectId: model.projectId,
    batchId: model.batchId,
    inventoryItemId: model.inventoryItemId,
    qtyKg: model.qtyKg,
    observation: model.observation,
    fedAt: model.fedAt,
    clientMutationId: model.clientMutationId,
    createdAt: model.createdAt,
  });
}

export function toPersistence(entity: FeedingLog): FeedingLogPersistenceModel {
  const model = new FeedingLogPersistenceModel();
  model.id = entity.id;
  model.projectId = entity.projectId;
  model.batchId = entity.batchId;
  model.inventoryItemId = entity.inventoryItemId;
  model.qtyKg = entity.qtyKg;
  model.observation = entity.observation;
  model.fedAt = entity.fedAt;
  model.clientMutationId = entity.clientMutationId;
  model.createdAt = entity.createdAt;
  return model;
}
