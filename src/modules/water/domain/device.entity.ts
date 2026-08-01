/**
 * Pure domain `Device` (TASK-027, MOD-06 §4.3/F6, ERD `DEVICE`). A sensor device is bound to
 * exactly one pond/project (R6): it may only ever ingest readings for that project, and that
 * mapping — not any URL or payload value — is the authority for where a reading lands. The raw
 * device key is never held here; only its SHA-256 digest (`deviceKeyHash`), looked up by exact
 * equality during authentication (same model as `RefreshToken`/`PasswordResetToken`).
 */
export interface DeviceProps {
  readonly id: string;
  readonly projectId: string;
  readonly pondId: string;
  readonly deviceKeyHash: string;
  readonly label: string;
  readonly registeredAt: Date;
}

export class Device {
  private constructor(private readonly props: DeviceProps) {}

  static reconstitute(props: DeviceProps): Device {
    return new Device(props);
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

  get deviceKeyHash(): string {
    return this.props.deviceKeyHash;
  }

  get label(): string {
    return this.props.label;
  }

  get registeredAt(): Date {
    return this.props.registeredAt;
  }
}
