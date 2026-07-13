/**
 * Pure domain `InventoryTxn` (TASK-020, MOD-05 §4.3/F9, ERD `INVENTORY_TXN`). `costMinor` is an
 * ERD/contract extension (AC-082/R8 — "an inventory receipt cost... integer minor units", never
 * modeled as a field anywhere in ERD.md or the CON-024 schema before this task); optional and
 * BDT-only (ADR-018), same pattern as `Stocking.stockingCostMinor` (TASK-019).
 */
export interface InventoryTxnProps {
  readonly id: string;
  readonly projectId: string;
  readonly itemId: string;
  readonly delta: number;
  readonly reason: string;
  readonly costMinor: number | null;
  readonly occurredAt: Date;
}

export class InventoryTxn {
  private constructor(private readonly props: InventoryTxnProps) {}

  static reconstitute(props: InventoryTxnProps): InventoryTxn {
    return new InventoryTxn(props);
  }

  get id(): string {
    return this.props.id;
  }

  get projectId(): string {
    return this.props.projectId;
  }

  get itemId(): string {
    return this.props.itemId;
  }

  get delta(): number {
    return this.props.delta;
  }

  get reason(): string {
    return this.props.reason;
  }

  get costMinor(): number | null {
    return this.props.costMinor;
  }

  get occurredAt(): Date {
    return this.props.occurredAt;
  }
}
