import { InventoryItem } from '../../domain/inventory-item.entity';

/** Wire shape of the `InventoryItem` schema (contracts/openapi.yaml, CON-022/023). */
export interface InventoryItemResponse {
  id: string;
  projectId: string;
  name: string;
  feedType: string | null;
  unit: string;
  quantity: number;
  lowStockThreshold: number | null;
}

export function toInventoryItemResponse(item: InventoryItem): InventoryItemResponse {
  return {
    id: item.id,
    projectId: item.projectId,
    name: item.name,
    feedType: item.feedType,
    unit: item.unit,
    quantity: item.quantity,
    lowStockThreshold: item.lowStockThreshold,
  };
}
