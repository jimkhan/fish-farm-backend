import { Treatment } from '../../domain/treatment.entity';
import { TreatmentPersistenceModel } from './treatment.persistence-model';

export function toDomain(model: TreatmentPersistenceModel): Treatment {
  return Treatment.reconstitute({
    id: model.id,
    projectId: model.projectId,
    batchId: model.batchId,
    product: model.product,
    dose: model.dose,
    // TypeORM returns Postgres `date` columns as 'YYYY-MM-DD' strings at runtime, not Date
    // objects — `new Date(...)` normalizes either shape.
    administeredOn: new Date(model.administeredOn),
    withdrawalDays: model.withdrawalDays,
    createdAt: model.createdAt,
  });
}

export function toPersistence(entity: Treatment): TreatmentPersistenceModel {
  const model = new TreatmentPersistenceModel();
  model.id = entity.id;
  model.projectId = entity.projectId;
  model.batchId = entity.batchId;
  model.product = entity.product;
  model.dose = entity.dose;
  model.administeredOn = entity.administeredOn;
  model.withdrawalDays = entity.withdrawalDays;
  model.createdAt = entity.createdAt;
  return model;
}
