/**
 * Pure domain `Batch` (TASK-019, MOD-04 §4.3/F3, ERD `BATCH`). `harvestedCount` and `stockingId`
 * are not yet in ERD.md's mermaid table (a documented gap this task closes — synced back to
 * ERD.md, same pattern as `User.status` in TASK-008) — R4's survival formula needs both a harvest
 * counter and the 1–1 link back to the `Stocking` that created this batch (R3, ERD's `stocking_id
 * FK, UK`).
 */
export type BatchStatus = 'ACTIVE' | 'HARVESTING' | 'CLOSED';

export interface BatchProps {
  readonly id: string;
  readonly projectId: string;
  readonly pondId: string;
  readonly stockingId: string;
  readonly speciesId: string;
  readonly initialCount: number;
  readonly cumulativeMortality: number;
  readonly harvestedCount: number;
  readonly latestAvgWeightG: number | null;
  readonly status: BatchStatus;
  readonly stockedOn: Date;
  readonly createdAt: Date;
}

export class Batch {
  private constructor(private readonly props: BatchProps) {}

  static reconstitute(props: BatchProps): Batch {
    return new Batch(props);
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

  get stockingId(): string {
    return this.props.stockingId;
  }

  get speciesId(): string {
    return this.props.speciesId;
  }

  get initialCount(): number {
    return this.props.initialCount;
  }

  get cumulativeMortality(): number {
    return this.props.cumulativeMortality;
  }

  get harvestedCount(): number {
    return this.props.harvestedCount;
  }

  get latestAvgWeightG(): number | null {
    return this.props.latestAvgWeightG;
  }

  get status(): BatchStatus {
    return this.props.status;
  }

  get stockedOn(): Date {
    return this.props.stockedOn;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  /** R4: never negative — mortality/harvest exceeding initial clamps at 0 (a flagged data anomaly). */
  get survivalEstimate(): number {
    return Math.max(0, this.props.initialCount - this.props.cumulativeMortality - this.props.harvestedCount);
  }

  /** R6: no weight-derived biomass before the first sampling. */
  get biomassGrams(): number | null {
    return this.props.latestAvgWeightG === null
      ? null
      : this.survivalEstimate * this.props.latestAvgWeightG;
  }

  /** AC-063: applies a mortality count (already de-duplicated by the idempotent event consumer). */
  applyMortality(count: number): Batch {
    return new Batch({ ...this.props, cumulativeMortality: this.props.cumulativeMortality + count });
  }

  /** AC-066: replaces the latest sampling weight. */
  applySampling(avgWeightG: number): Batch {
    return new Batch({ ...this.props, latestAvgWeightG: avgWeightG });
  }

  /** AC-067: applies a harvested count. */
  applyHarvest(count: number): Batch {
    return new Batch({ ...this.props, harvestedCount: this.props.harvestedCount + count });
  }
}
