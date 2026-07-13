/**
 * Pure domain `Treatment` (TASK-028, MOD-07 §4.3/F2, ERD `TREATMENT`). Owner-recorded (module doc
 * §2.3 — unlike mortality/sampling, treatments are not worker-mobile/offline, so no
 * `client_mutation_id` (ERD carries none for this table).
 */
export interface TreatmentProps {
  readonly id: string;
  readonly projectId: string;
  readonly batchId: string;
  readonly product: string;
  readonly dose: string;
  readonly administeredOn: Date;
  readonly withdrawalDays: number;
  readonly createdAt: Date;
}

export class Treatment {
  private constructor(private readonly props: TreatmentProps) {}

  static reconstitute(props: TreatmentProps): Treatment {
    return new Treatment(props);
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

  get product(): string {
    return this.props.product;
  }

  get dose(): string {
    return this.props.dose;
  }

  get administeredOn(): Date {
    return this.props.administeredOn;
  }

  get withdrawalDays(): number {
    return this.props.withdrawalDays;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  /** ERD `export_safe_after` — derived, never persisted. */
  get exportSafeAfter(): Date {
    return new Date(this.props.administeredOn.getTime() + this.props.withdrawalDays * 86_400_000);
  }

  /**
   * R7/AC-101: true when `date` falls inside the withdrawal window
   * `[administeredOn, exportSafeAfter)` — an EXPORT harvest on `date` should be advised against.
   * Consumed by TASK-031's harvest use-case once it exists (this task's own non-goal is harvest
   * itself); proven here at the domain-rule level so TASK-031 only has to wire the call.
   */
  coversDate(date: Date): boolean {
    return date >= this.props.administeredOn && date < this.exportSafeAfter;
  }
}
