import { Inject, Injectable } from '@nestjs/common';
import { NotFoundError } from '../../../shared-kernel/errors/domain-error';
import {
  INVENTORY_ITEM_REPOSITORY,
  InventoryItemRepositoryPort,
} from './ports/inventory-item-repository.port';
import {
  INVENTORY_TXN_REPOSITORY,
  InventoryTxnRepositoryPort,
} from './ports/inventory-txn-repository.port';

export interface ReconciliationResult {
  readonly itemId: string;
  readonly quantity: number;
  readonly sumOfTransactions: number;
  readonly matches: boolean;
}

/**
 * F9/AC-080: `quantity == Σreceipts − Σdeductions`. No dedicated HTTP endpoint — module doc §4.7
 * ("CON-018/018a/022/023/024 already defined. No new endpoints/schemas required") scopes
 * reconciliation as an internal capability for this task, proven directly; a read endpoint can be
 * added later (mirrors how TASK-015 left `RecipientResolver` built-and-tested but unwired until
 * its consumer, TASK-016, needed it).
 */
@Injectable()
export class ReconcileInventoryUseCase {
  constructor(
    @Inject(INVENTORY_ITEM_REPOSITORY) private readonly items: InventoryItemRepositoryPort,
    @Inject(INVENTORY_TXN_REPOSITORY) private readonly txns: InventoryTxnRepositoryPort,
  ) {}

  async execute(itemId: string): Promise<ReconciliationResult> {
    const item = await this.items.findById(itemId);
    if (!item) {
      throw new NotFoundError('Inventory item not found.');
    }

    const allTxns = await this.txns.findAllForItem(itemId);
    const sumOfTransactions = allTxns.reduce((sum, txn) => sum + txn.delta, 0);

    return {
      itemId,
      quantity: item.quantity,
      sumOfTransactions,
      matches: item.quantity === sumOfTransactions,
    };
  }
}
