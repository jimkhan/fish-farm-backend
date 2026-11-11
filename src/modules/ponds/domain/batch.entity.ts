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

  /**
   * Fish still in the pond (MOD-04 R4): initial minus deaths minus fish taken out by harvest.
   * Never negative — mortality/harvest exceeding initial clamps at 0 (a flagged data anomaly).
   *
   * This is the *stock* figure, and the right basis for biomass and feed. It is deliberately NOT
   * the basis for survival rate — see {@link survivorsExcludingHarvest}.
   */
  get survivalEstimate(): number {
    return Math.max(0, this.props.initialCount - this.props.cumulativeMortality - this.props.harvestedCount);
  }

  /**
   * Fish that did not die (MOD-04 R4a): initial minus mortality only. A harvested fish survived —
   * it was sold, not lost — so counting it against survival misreports husbandry as loss.
   *
   * Using `survivalEstimate` here made a farmer who harvested 60% of a perfectly healthy batch
   * read "survival rate 40%", indistinguishable from a mass die-off.
   */
  get survivorsExcludingHarvest(): number {
    return Math.max(0, this.props.initialCount - this.props.cumulativeMortality);
  }

  /** R6: no weight-derived biomass before the first sampling. */
  get biomassGrams(): number | null {
    return this.props.latestAvgWeightG === null
      ? null
      : this.survivalEstimate * this.props.latestAvgWeightG;
  }

  /** True once nothing remains in the pond — every fish is dead or harvested. */
  private get isDepleted(): boolean {
    return this.survivalEstimate === 0;
  }

  /** AC-063: applies a mortality count (already de-duplicated by the idempotent event consumer). */
  applyMortality(count: number): Batch {
    const next = new Batch({
      ...this.props,
      cumulativeMortality: this.props.cumulativeMortality + count,
    });
    // A batch wiped out entirely is over; nothing is left to feed, sample or harvest. It skips
    // HARVESTING because that stage describes a batch being *taken out*, and this one never was.
    return next.isDepleted ? next.withStatus('CLOSED') : next;
  }

  /** AC-066: replaces the latest sampling weight. */
  applySampling(avgWeightG: number): Batch {
    return new Batch({ ...this.props, latestAvgWeightG: avgWeightG });
  }

  /**
   * AC-067: applies a harvested count, advancing the batch along `ACTIVE→HARVESTING→CLOSED`
   * (MOD-04 §2.5 edge case 7).
   *
   * The status used to stay `ACTIVE` forever, which is not cosmetic: `findWithStockInPond()` (the
   * feeding-reminder scan) selects on it, so a pond harvested and emptied in March still produced
   * twice-daily feed reminders for the worker months later.
   */
  applyHarvest(count: number): Batch {
    const next = new Batch({ ...this.props, harvestedCount: this.props.harvestedCount + count });
    return next.withStatus(next.isDepleted ? 'CLOSED' : 'HARVESTING');
  }

  /** Terminal states never regress — a later event on a CLOSED batch leaves it CLOSED. */
  private withStatus(status: BatchStatus): Batch {
    if (this.props.status === 'CLOSED') {
      return this;
    }
    return new Batch({ ...this.props, status });
  }
}
