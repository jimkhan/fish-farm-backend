import { Mortality } from '../../domain/mortality.entity';
import { MortalityPersistenceModel } from './mortality.persistence-model';

export function toDomain(model: MortalityPersistenceModel): Mortality {
  return Mortality.reconstitute({
    id: model.id,
    projectId: model.projectId,
    batchId: model.batchId,
    count: model.count,
    causeCategory: model.causeCategory,
    photoUrl: model.photoUrl,
    occurredAt: model.occurredAt,
    clientMutationId: model.clientMutationId,
    createdAt: model.createdAt,
  });
}

export function toPersistence(entity: Mortality): MortalityPersistenceModel {
  const model = new MortalityPersistenceModel();
  model.id = entity.id;
  model.projectId = entity.projectId;
  model.batchId = entity.batchId;
  model.count = entity.count;
  model.causeCategory = entity.causeCategory;
  model.photoUrl = entity.photoUrl;
  model.occurredAt = entity.occurredAt;
  model.clientMutationId = entity.clientMutationId;
  model.createdAt = entity.createdAt;
  return model;
}
