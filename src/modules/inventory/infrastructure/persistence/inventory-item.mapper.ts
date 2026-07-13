import { InventoryItem } from '../../domain/inventory-item.entity';
import { InventoryItemPersistenceModel } from './inventory-item.persistence-model';

export function toDomain(model: InventoryItemPersistenceModel): InventoryItem {
  return InventoryItem.reconstitute({
    id: model.id,
    projectId: model.projectId,
    name: model.name,
    feedType: model.feedType,
    unit: model.unit,
    quantity: model.quantity,
    lowStockThreshold: model.lowStockThreshold,
    createdAt: model.createdAt,
  });
}

export function toPersistence(entity: InventoryItem): InventoryItemPersistenceModel {
  const model = new InventoryItemPersistenceModel();
  model.id = entity.id;
  model.projectId = entity.projectId;
  model.name = entity.name;
  model.feedType = entity.feedType;
  model.unit = entity.unit;
  model.quantity = entity.quantity;
  model.lowStockThreshold = entity.lowStockThreshold;
  model.createdAt = entity.createdAt;
  return model;
}
