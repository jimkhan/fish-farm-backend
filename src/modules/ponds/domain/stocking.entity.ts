/**
 * Pure domain `Stocking` (TASK-019, MOD-04 §4.3, ERD `STOCKING`). Each Stocking creates exactly
 * one `Batch` (R3) — `RecordStockingUseCase` constructs both in one transaction.
 */
export type StockingSource = 'HATCHERY' | 'WILD' | 'OTHER';

export interface StockingProps {
  readonly id: string;
  readonly projectId: string;
  readonly pondId: string;
  readonly speciesId: string;
  readonly source: StockingSource | null;
  readonly hatcheryName: string | null;
  readonly count: number;
  readonly stockedOn: Date;
  /** Integer minor units (poisha) — never float (NFR-015, AC-070). `null` when cost wasn't given. */
  readonly stockingCostMinor: number | null;
  readonly currency: 'BDT' | null;
  readonly createdAt: Date;
}

export class Stocking {
  private constructor(private readonly props: StockingProps) {}

  static reconstitute(props: StockingProps): Stocking {
    return new Stocking(props);
  }

  get id(): string {
    return this.props.id;
  }

  get projectId(): string {
    return this.props.projectId;
  }

  get pondId(): string {
    return this.props.pondId;
  }

  get speciesId(): string {
    return this.props.speciesId;
  }

  get source(): StockingSource | null {
    return this.props.source;
  }

  get hatcheryName(): string | null {
    return this.props.hatcheryName;
  }

  get count(): number {
    return this.props.count;
  }

  get stockedOn(): Date {
    return this.props.stockedOn;
  }

  get stockingCostMinor(): number | null {
    return this.props.stockingCostMinor;
  }

  get currency(): 'BDT' | null {
    return this.props.currency;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }
}
