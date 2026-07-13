/**
 * Pure domain `Mortality` (TASK-028, MOD-07 §4.3/F1, ERD `MORTALITY`). `causeCategory` is a free
 * string, not a closed enum — ERD types the column `string cause_category` (unlike e.g. harvest's
 * `enum grade`), and the module doc's own open question calls the controlled list "extensible"
 * (seed set only: {@link SUGGESTED_CAUSE_CATEGORIES}), so the server accepts any non-empty value.
 */
export const SUGGESTED_CAUSE_CATEGORIES = [
  'DISEASE',
  'WATER',
  'HANDLING',
  'PREDATION',
  'UNKNOWN',
] as const;

export interface MortalityProps {
  readonly id: string;
  readonly projectId: string;
  readonly batchId: string;
  readonly count: number;
  readonly causeCategory: string;
  readonly photoUrl: string | null;
  readonly occurredAt: Date;
  /** ADR-010 offline idempotency key — unique per project, replays never duplicate. */
  readonly clientMutationId: string;
  readonly createdAt: Date;
}

export class Mortality {
  private constructor(private readonly props: MortalityProps) {}

  static reconstitute(props: MortalityProps): Mortality {
    return new Mortality(props);
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

  get count(): number {
    return this.props.count;
  }

  get causeCategory(): string {
    return this.props.causeCategory;
  }

  get photoUrl(): string | null {
    return this.props.photoUrl;
  }

  get occurredAt(): Date {
    return this.props.occurredAt;
  }

  get clientMutationId(): string {
    return this.props.clientMutationId;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }
}
