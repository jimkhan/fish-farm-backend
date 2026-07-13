import { InventoryTxn } from '../../domain/inventory-txn.entity';

/** Wire shape of the `InventoryTxn` schema (contracts/openapi.yaml, CON-024) + `cost` (AC-082). */
export interface InventoryTxnResponse {
  id: string;
  itemId: string;
  delta: number;
  reason: string;
  cost: { amountMinor: number; currency: 'BDT' } | null;
  at: string;
}

export function toInventoryTxnResponse(txn: InventoryTxn): InventoryTxnResponse {
  return {
    id: txn.id,
    itemId: txn.itemId,
    delta: txn.delta,
    reason: txn.reason,
    cost: txn.costMinor === null ? null : { amountMinor: txn.costMinor, currency: 'BDT' },
    at: txn.occurredAt.toISOString(),
  };
}
