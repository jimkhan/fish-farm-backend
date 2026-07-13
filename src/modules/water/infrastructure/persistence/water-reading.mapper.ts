import { WaterReading } from '../../domain/water-reading.entity';
import { WaterReadingPersistenceModel } from './water-reading.persistence-model';

export function toDomain(model: WaterReadingPersistenceModel): WaterReading {
  return WaterReading.reconstitute({
    id: model.id,
    projectId: model.projectId,
    pondId: model.pondId,
    parameter: model.parameter,
    value: model.value,
    source: model.source,
    deviceId: model.deviceId,
    readAt: model.readAt,
    clientMutationId: model.clientMutationId,
    createdAt: model.createdAt,
  });
}

export function toPersistence(entity: WaterReading): WaterReadingPersistenceModel {
  const model = new WaterReadingPersistenceModel();
  model.id = entity.id;
  model.projectId = entity.projectId;
  model.pondId = entity.pondId;
  model.parameter = entity.parameter;
  model.value = entity.value;
  model.source = entity.source;
  model.deviceId = entity.deviceId;
  model.readAt = entity.readAt;
  model.clientMutationId = entity.clientMutationId;
  model.createdAt = entity.createdAt;
  return model;
}
