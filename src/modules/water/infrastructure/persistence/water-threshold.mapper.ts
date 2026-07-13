import { WaterThreshold } from '../../domain/water-threshold.entity';
import { WaterThresholdPersistenceModel } from './water-threshold.persistence-model';

export function toDomain(model: WaterThresholdPersistenceModel): WaterThreshold {
  return WaterThreshold.reconstitute({
    id: model.id,
    projectId: model.projectId,
    parameter: model.parameter,
    min: model.min,
    max: model.max,
    critical: model.critical,
  });
}

export function toPersistence(entity: WaterThreshold): WaterThresholdPersistenceModel {
  const model = new WaterThresholdPersistenceModel();
  model.id = entity.id;
  model.projectId = entity.projectId;
  model.parameter = entity.parameter;
  model.min = entity.min;
  model.max = entity.max;
  model.critical = entity.critical;
  return model;
}
