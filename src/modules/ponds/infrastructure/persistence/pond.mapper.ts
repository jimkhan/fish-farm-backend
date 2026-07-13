import { Pond } from '../../domain/pond.entity';
import { PondPersistenceModel } from './pond.persistence-model';

export function toDomain(model: PondPersistenceModel): Pond {
  return Pond.reconstitute({
    id: model.id,
    projectId: model.projectId,
    name: model.name,
    area: model.area,
    depthM: model.depthM,
    notes: model.notes,
    createdAt: model.createdAt,
  });
}

export function toPersistence(entity: Pond): PondPersistenceModel {
  const model = new PondPersistenceModel();
  model.id = entity.id;
  model.projectId = entity.projectId;
  model.name = entity.name;
  model.area = entity.area;
  model.depthM = entity.depthM;
  model.notes = entity.notes;
  model.createdAt = entity.createdAt;
  return model;
}
