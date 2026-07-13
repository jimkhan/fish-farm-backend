/**
 * Pure domain `Pond` (TASK-018, MOD-04 §4.3, ERD `POND`). `area` is in the owning project's
 * `landUnit` (ADR-018) — this entity doesn't know or care which unit; display conversion is a
 * presentation concern.
 */
export interface PondProps {
  readonly id: string;
  readonly projectId: string;
  readonly name: string;
  readonly area: number;
  readonly depthM: number | null;
  readonly notes: string | null;
  readonly createdAt: Date;
}

export class Pond {
  private constructor(private readonly props: PondProps) {}

  static reconstitute(props: PondProps): Pond {
    return new Pond(props);
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

  get area(): number {
    return this.props.area;
  }

  get depthM(): number | null {
    return this.props.depthM;
  }

  get notes(): string | null {
    return this.props.notes;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }
}
