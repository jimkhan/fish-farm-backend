export type FeedType = 'FLOATING' | 'SINKING' | 'NURSERY_DUST';

/**
 * Pure domain `InventoryItem` (TASK-020, MOD-05 §4.3/F7, ERD `INVENTORY_ITEM`). `quantity` is a
 * cached running balance (ERD's own "cached balance" annotation, NFR-004 — fast reads without
 * summing every transaction); `ReconcileInventoryUseCase` is the safety net that detects drift
 * between this cache and the transaction ledger.
 */
export interface InventoryItemProps {
  readonly id: string;
  readonly projectId: string;
  readonly name: string;
  readonly feedType: FeedType | null;
  readonly unit: string;
  readonly quantity: number;
  readonly lowStockThreshold: number | null;
  readonly createdAt: Date;
}

export class InventoryItem {
  private constructor(private readonly props: InventoryItemProps) {}

  static reconstitute(props: InventoryItemProps): InventoryItem {
    return new InventoryItem(props);
  }

  get id(): string {
    return this.props.id;
  }

  get projectId(): string {
    return this.props.projectId;
  }

  get name(): string {
    return this.props.name;
  }

  get feedType(): FeedType | null {
    return this.props.feedType;
  }

  get unit(): string {
    return this.props.unit;
  }

  get quantity(): number {
    return this.props.quantity;
  }

  get lowStockThreshold(): number | null {
    return this.props.lowStockThreshold;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  /** R5/F9: applies a signed delta (positive=receipt, negative=deduction/adjustment) to the cache. */
  applyDelta(delta: number): InventoryItem {
    return new InventoryItem({ ...this.props, quantity: this.props.quantity + delta });
  }

  /**
   * R6/AC-079: true only when this item's quantity has just crossed DOWN through the threshold —
   * i.e. it was at/above `lowStockThreshold` before this delta and is now below it. Staying below
   * across further deductions never re-fires (single-fire semantics live here, not just in
   * MOD-09's dedup — this avoids publishing the event at all on non-crossing deductions).
   */
  static crossesLowStockThreshold(
    quantityBefore: number,
    quantityAfter: number,
    lowStockThreshold: number | null,
  ): boolean {
    if (lowStockThreshold === null) {
      return false;
    }
    return quantityBefore >= lowStockThreshold && quantityAfter < lowStockThreshold;
  }
}
