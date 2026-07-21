import { Harvest } from '../../domain/harvest.entity';
import { HarvestPersistenceModel } from './harvest.persistence-model';

export function toDomain(model: HarvestPersistenceModel): Harvest {
  return Harvest.reconstitute({
    id: model.id,
    projectId: model.projectId,
    batchId: model.batchId,
    quantity: model.quantity,
    totalWeightKg: model.totalWeightKg,
    grade: model.grade,
    harvestedOn: new Date(model.harvestedOn),
    revenueMinor: model.revenueMinor,
    clientMutationId: model.clientMutationId,
    createdAt: model.createdAt,
  });
}

export function toPersistence(entity: Harvest): HarvestPersistenceModel {
  const model = new HarvestPersistenceModel();
  model.id = entity.id;
  model.projectId = entity.projectId;
  model.batchId = entity.batchId;
  model.quantity = entity.quantity;
  model.totalWeightKg = entity.totalWeightKg;
  model.grade = entity.grade;
  model.harvestedOn = entity.harvestedOn;
  model.revenueMinor = entity.revenueMinor;
  model.clientMutationId = entity.clientMutationId;
  model.createdAt = entity.createdAt;
  return model;
}
