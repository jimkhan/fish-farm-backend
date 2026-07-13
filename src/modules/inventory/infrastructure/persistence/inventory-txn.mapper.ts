import { InventoryTxn } from '../../domain/inventory-txn.entity';
import { InventoryTxnPersistenceModel } from './inventory-txn.persistence-model';

export function toDomain(model: InventoryTxnPersistenceModel): InventoryTxn {
  return InventoryTxn.reconstitute({
    id: model.id,
    projectId: model.projectId,
    itemId: model.itemId,
    delta: model.delta,
    reason: model.reason,
    costMinor: model.costMinor,
    occurredAt: model.occurredAt,
  });
}

export function toPersistence(entity: InventoryTxn): InventoryTxnPersistenceModel {
  const model = new InventoryTxnPersistenceModel();
  model.id = entity.id;
  model.projectId = entity.projectId;
  model.itemId = entity.itemId;
  model.delta = entity.delta;
  model.reason = entity.reason;
  model.costMinor = entity.costMinor;
  model.occurredAt = entity.occurredAt;
  return model;
}
