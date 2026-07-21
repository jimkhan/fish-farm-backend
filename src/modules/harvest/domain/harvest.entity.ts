export type HarvestGrade = 'EXPORT' | 'LOCAL';

/**
 * Pure domain `Harvest` (TASK-031, MOD-07 §4.3/F7, ERD `HARVEST`). `clientMutationId` is a
 * documented ERD gap synced back — ERD's original `HARVEST` shape had none, but the module doc
 * groups harvest under the same offline guarantee as mortality/sampling ("NFR-001... AC-102",
 * edge case 9: "Offline mortality/sampling/harvest synced later — same processing path"), and
 * every other Worker-loggable entity in this codebase has it with zero exceptions; it also guards
 * the ONLINE path against an accidental double-submit on a flaky network, not just offline replay.
 */
export interface HarvestProps {
  readonly id: string;
  readonly projectId: string;
  readonly batchId: string;
  readonly quantity: number;
  readonly totalWeightKg: number;
  readonly grade: HarvestGrade;
  readonly harvestedOn: Date;
  readonly revenueMinor: number | null;
  readonly clientMutationId: string;
  readonly createdAt: Date;
}

export class Harvest {
  private constructor(private readonly props: HarvestProps) {}

  static reconstitute(props: HarvestProps): Harvest {
    return new Harvest(props);
  }

  get id(): string {
    return this.props.id;
  }

  get projectId(): string {
    return this.props.projectId;
  }

  get batchId(): string {
    return this.props.batchId;
  }

  get quantity(): number {
    return this.props.quantity;
  }

  get totalWeightKg(): number {
    return this.props.totalWeightKg;
  }

  get grade(): HarvestGrade {
    return this.props.grade;
  }

  get harvestedOn(): Date {
    return this.props.harvestedOn;
  }

  get revenueMinor(): number | null {
    return this.props.revenueMinor;
  }

  get clientMutationId(): string {
    return this.props.clientMutationId;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }
}
