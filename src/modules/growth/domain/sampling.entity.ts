/**
 * Pure domain `Sampling` (TASK-029, MOD-07 §4.3/F4, ERD `SAMPLING`).
 */
export interface SamplingProps {
  readonly id: string;
  readonly projectId: string;
  readonly batchId: string;
  readonly sampleSize: number;
  readonly avgWeightG: number;
  readonly sampledOn: Date;
  readonly clientMutationId: string;
  readonly createdAt: Date;
}

export class Sampling {
  private constructor(private readonly props: SamplingProps) {}

  static reconstitute(props: SamplingProps): Sampling {
    return new Sampling(props);
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

  get sampleSize(): number {
    return this.props.sampleSize;
  }

  get avgWeightG(): number {
    return this.props.avgWeightG;
  }

  get sampledOn(): Date {
    return this.props.sampledOn;
  }

  get clientMutationId(): string {
    return this.props.clientMutationId;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }
}
