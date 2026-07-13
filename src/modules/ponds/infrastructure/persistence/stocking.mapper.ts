import { Stocking } from '../../domain/stocking.entity';
import { StockingPersistenceModel } from './stocking.persistence-model';

export function toDomain(model: StockingPersistenceModel): Stocking {
  return Stocking.reconstitute({
    id: model.id,
    projectId: model.projectId,
    pondId: model.pondId,
    speciesId: model.speciesId,
    source: model.source,
    hatcheryName: model.hatcheryName,
    count: model.count,
    // TypeORM returns Postgres `date` columns as 'YYYY-MM-DD' strings at runtime, not Date
    // objects — `new Date(...)` normalizes either shape.
    stockedOn: new Date(model.stockedOn),
    stockingCostMinor: model.stockingCostMinor,
    currency: model.currency,
    createdAt: model.createdAt,
  });
}

export function toPersistence(entity: Stocking): StockingPersistenceModel {
  const model = new StockingPersistenceModel();
  model.id = entity.id;
  model.projectId = entity.projectId;
  model.pondId = entity.pondId;
  model.speciesId = entity.speciesId;
  model.source = entity.source;
  model.hatcheryName = entity.hatcheryName;
  model.count = entity.count;
  model.stockedOn = entity.stockedOn;
  model.stockingCostMinor = entity.stockingCostMinor;
  model.currency = entity.currency;
  model.createdAt = entity.createdAt;
  return model;
}
