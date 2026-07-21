import { SyncMutation } from '../../domain/sync-mutation.entity';
import { SyncMutationPersistenceModel } from './sync-mutation.persistence-model';

export function toDomain(model: SyncMutationPersistenceModel): SyncMutation {
  return SyncMutation.reconstitute({
    clientMutationId: model.clientMutationId,
    projectId: model.projectId,
    userId: model.userId,
    entity: model.entity,
    status: model.status,
    serverId: model.serverId,
    processedAt: model.processedAt,
  });
}

export function toPersistence(entity: SyncMutation): SyncMutationPersistenceModel {
  const model = new SyncMutationPersistenceModel();
  model.clientMutationId = entity.clientMutationId;
  model.projectId = entity.projectId;
  model.userId = entity.userId;
  model.entity = entity.entity;
  model.status = entity.status;
  model.serverId = entity.serverId;
  model.processedAt = entity.processedAt;
  return model;
}
