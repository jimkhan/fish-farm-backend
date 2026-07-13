import { Sampling } from '../../domain/sampling.entity';
import { SamplingPersistenceModel } from './sampling.persistence-model';

export function toDomain(model: SamplingPersistenceModel): Sampling {
  return Sampling.reconstitute({
    id: model.id,
    projectId: model.projectId,
    batchId: model.batchId,
    sampleSize: model.sampleSize,
    avgWeightG: model.avgWeightG,
    // TypeORM returns Postgres `date` columns as 'YYYY-MM-DD' strings at runtime, not Date
    // objects — `new Date(...)` normalizes either shape.
    sampledOn: new Date(model.sampledOn),
    clientMutationId: model.clientMutationId,
    createdAt: model.createdAt,
  });
}

export function toPersistence(entity: Sampling): SamplingPersistenceModel {
  const model = new SamplingPersistenceModel();
  model.id = entity.id;
  model.projectId = entity.projectId;
  model.batchId = entity.batchId;
  model.sampleSize = entity.sampleSize;
  model.avgWeightG = entity.avgWeightG;
  model.sampledOn = entity.sampledOn;
  model.clientMutationId = entity.clientMutationId;
  model.createdAt = entity.createdAt;
  return model;
}
