import { FinancialCategory, FinancialKind } from './category.vo';

/**
 * Pure domain `FinancialTxn` (TASK-032, MOD-08 §4.3/F1, ERD `FINANCIAL_TXN`). `sourceRef` is the
 * idempotency key for auto-ingested transactions (R3 — StockingRecorded/FeedCostIncurred/
 * HarvestRevenueEarned each ingest exactly once by source reference); a manually Owner-recorded
 * transaction has no `sourceRef` (`null`) — it's a deliberate one-off entry, not a replay-prone
 * offline mutation (same category as `Treatment` having no `clientMutationId`, TASK-028).
 */
export interface FinancialTxnProps {
  readonly id: string;
  readonly projectId: string;
  readonly kind: FinancialKind;
  readonly category: FinancialCategory;
  readonly amountMinor: number;
  readonly occurredOn: Date;
  readonly sourceRef: string | null;
  readonly note: string | null;
  readonly createdAt: Date;
}

export class FinancialTxn {
  private constructor(private readonly props: FinancialTxnProps) {}

  static reconstitute(props: FinancialTxnProps): FinancialTxn {
    return new FinancialTxn(props);
  }

  get id(): string {
    return this.props.id;
  }

  get projectId(): string {
    return this.props.projectId;
  }

  get kind(): FinancialKind {
    return this.props.kind;
  }

  get category(): FinancialCategory {
    return this.props.category;
  }

  get amountMinor(): number {
    return this.props.amountMinor;
  }

  get occurredOn(): Date {
    return this.props.occurredOn;
  }

  get sourceRef(): string | null {
    return this.props.sourceRef;
  }

  get note(): string | null {
    return this.props.note;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }
}
