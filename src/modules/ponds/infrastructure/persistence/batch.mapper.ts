import { Batch } from '../../domain/batch.entity';
import { BatchPersistenceModel } from './batch.persistence-model';

export function toDomain(model: BatchPersistenceModel): Batch {
  return Batch.reconstitute({
    id: model.id,
    projectId: model.projectId,
    pondId: model.pondId,
    stockingId: model.stockingId,
    speciesId: model.speciesId,
    initialCount: model.initialCount,
    cumulativeMortality: model.cumulativeMortality,
    harvestedCount: model.harvestedCount,
    latestAvgWeightG: model.latestAvgWeightG,
    status: model.status,
    // See the identical note in stocking.mapper.ts re: Postgres `date` columns.
    stockedOn: new Date(model.stockedOn),
    createdAt: model.createdAt,
  });
}

export function toPersistence(entity: Batch): BatchPersistenceModel {
  const model = new BatchPersistenceModel();
  model.id = entity.id;
  model.projectId = entity.projectId;
  model.pondId = entity.pondId;
  model.stockingId = entity.stockingId;
  model.speciesId = entity.speciesId;
  model.initialCount = entity.initialCount;
  model.cumulativeMortality = entity.cumulativeMortality;
  model.harvestedCount = entity.harvestedCount;
  model.latestAvgWeightG = entity.latestAvgWeightG;
  model.status = entity.status;
  model.stockedOn = entity.stockedOn;
  model.createdAt = entity.createdAt;
  return model;
}
