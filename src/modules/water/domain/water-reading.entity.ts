export type WaterParameter = 'DO' | 'TEMP' | 'PH' | 'AMMONIA' | 'NITRITE' | 'ALKALINITY' | 'SECCHI';
export type WaterSource = 'MANUAL' | 'SENSOR';

/**
 * Pure domain `WaterReading` (TASK-023, MOD-06 §4.3/F1, ERD `WATER_READING`). Only `source =
 * MANUAL` is reachable through this task's endpoint (CON-026, an authenticated-member route) —
 * `SENSOR` readings require the device-key-authenticated ingestion path TASK-027 adds (P3,
 * explicit non-goal here); a client-supplied `source` on this endpoint is always overwritten to
 * `MANUAL` server-side, never trusted (same pattern as `currency`, ADR-018).
 */
export interface WaterReadingProps {
  readonly id: string;
  readonly projectId: string;
  readonly pondId: string;
  readonly parameter: WaterParameter;
  readonly value: number;
  readonly source: WaterSource;
  readonly deviceId: string | null;
  readonly readAt: Date;
  readonly clientMutationId: string;
  readonly createdAt: Date;
}

export class WaterReading {
  private constructor(private readonly props: WaterReadingProps) {}

  static reconstitute(props: WaterReadingProps): WaterReading {
    return new WaterReading(props);
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

  get parameter(): WaterParameter {
    return this.props.parameter;
  }

  get value(): number {
    return this.props.value;
  }

  get source(): WaterSource {
    return this.props.source;
  }

  get deviceId(): string | null {
    return this.props.deviceId;
  }

  get readAt(): Date {
    return this.props.readAt;
  }

  get clientMutationId(): string {
    return this.props.clientMutationId;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }
}
