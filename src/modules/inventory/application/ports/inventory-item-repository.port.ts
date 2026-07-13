import { InventoryItem } from '../../domain/inventory-item.entity';

/** Tenant-scoped (ADR-006). */
export interface InventoryItemRepositoryPort {
  findAllInCurrentProject(): Promise<InventoryItem[]>;
  findById(itemId: string): Promise<InventoryItem | null>;
  save(item: InventoryItem): Promise<InventoryItem>;
}

export const INVENTORY_ITEM_REPOSITORY = 'InventoryItemRepositoryPort';
