/**
 * Pure domain `Project` (TASK-011, MOD-03 §4.3, ERD `PROJECT`). Framework-free — never carries
 * TypeORM decorators (CLAUDE.md invariant #3). `currency` is always `'BDT'` (ADR-018: "not a user
 * choice in v1") — the field stays on the model for forward-compatibility only.
 */
export type ProjectStatus = 'ACTIVE' | 'CLOSED';
export type LandUnit = 'DECIMAL' | 'KATHA' | 'BIGHA';

export interface ProjectProps {
  readonly id: string;
  readonly name: string;
  readonly siteLat: number;
  readonly siteLng: number;
  readonly address: string | null;
  readonly currency: 'BDT';
  readonly landUnit: LandUnit;
  readonly status: ProjectStatus;
  readonly createdAt: Date;
}

export class Project {
  private constructor(private readonly props: ProjectProps) {}

  static reconstitute(props: ProjectProps): Project {
    return new Project(props);
  }

  get id(): string {
    return this.props.id;
  }

  get name(): string {
    return this.props.name;
  }

  get siteLat(): number {
    return this.props.siteLat;
  }

  get siteLng(): number {
    return this.props.siteLng;
  }

  get address(): string | null {
    return this.props.address;
  }

  get currency(): 'BDT' {
    return this.props.currency;
  }

  get landUnit(): LandUnit {
    return this.props.landUnit;
  }

  get status(): ProjectStatus {
    return this.props.status;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get isClosed(): boolean {
    return this.props.status === 'CLOSED';
  }

  /** Applies an editable-field update (R4: only `name`/`address` while ACTIVE — see UpdateProjectUseCase). */
  withUpdate(fields: { name?: string; address?: string; status?: ProjectStatus }): Project {
    return new Project({
      ...this.props,
      name: fields.name ?? this.props.name,
      address: fields.address ?? this.props.address,
      status: fields.status ?? this.props.status,
    });
  }
}
