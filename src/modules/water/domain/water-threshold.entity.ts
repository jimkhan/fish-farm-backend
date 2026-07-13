import { WaterParameter } from './water-reading.entity';

/**
 * Pure domain `WaterThreshold` (TASK-023, MOD-06 §4.3/F2, ERD `WATER_THRESHOLD`). Configured
 * **per project** (R2) — CON-027/027a's own route (`/projects/{projectId}/water-thresholds`, no
 * `:pondId`) settles the module doc's own open question ("per project or per pond?") in favor of
 * project-level only; a per-pond override is a documented non-goal for this task.
 */
export interface WaterThresholdProps {
  readonly id: string;
  readonly projectId: string;
  readonly parameter: WaterParameter;
  readonly min: number | null;
  readonly max: number | null;
  readonly critical: number | null;
}

export class WaterThreshold {
  private constructor(private readonly props: WaterThresholdProps) {}

  static reconstitute(props: WaterThresholdProps): WaterThreshold {
    return new WaterThreshold(props);
  }

  get id(): string {
    return this.props.id;
  }

  get projectId(): string {
    return this.props.projectId;
  }

  get parameter(): WaterParameter {
    return this.props.parameter;
  }

  get min(): number | null {
    return this.props.min;
  }

  get max(): number | null {
    return this.props.max;
  }

  get critical(): number | null {
    return this.props.critical;
  }
}
