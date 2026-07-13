import { InventoryTxn } from '../../domain/inventory-txn.entity';

/** Tenant-scoped (ADR-006). */
export interface InventoryTxnRepositoryPort {
  findAllForItem(itemId: string): Promise<InventoryTxn[]>;
  save(txn: InventoryTxn): Promise<InventoryTxn>;
}

export const INVENTORY_TXN_REPOSITORY = 'InventoryTxnRepositoryPort';
