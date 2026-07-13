import { InvalidTransitionError } from './notifications-errors';

export type AlertType =
  | 'WATER_THRESHOLD'
  | 'WATER_EMERGENCY'
  | 'LOW_STOCK'
  | 'MISSED_TASK'
  | 'ABNORMAL_MORTALITY';

export type AlertSeverity = 'INFO' | 'WARNING' | 'CRITICAL';
export type AlertState = 'RAISED' | 'SENT' | 'ACKNOWLEDGED' | 'RESOLVED';

/** Alert types Workers may act on (R2); everything else is Owner-only to acknowledge (R8/AC-059). */
export const OPERATIONAL_ALERT_TYPES: readonly AlertType[] = [
  'MISSED_TASK',
  'LOW_STOCK',
  'WATER_THRESHOLD',
];

const SEVERITY_RANK: Record<AlertSeverity, number> = { INFO: 0, WARNING: 1, CRITICAL: 2 };

/**
 * Valid forward transitions (F1: `RAISED → SENT → ACKNOWLEDGED → RESOLVED`). `RAISED →
 * ACKNOWLEDGED` is also allowed: channel delivery (the only thing that would drive `SENT`) is
 * TASK-016's job, not built yet, so a user can view and acknowledge an alert in-app regardless of
 * whether a push was ever dispatched — the transition graph already permits this and needs no
 * change once TASK-016 lands.
 */
const VALID_TRANSITIONS: Record<AlertState, AlertState[]> = {
  RAISED: ['SENT', 'ACKNOWLEDGED'],
  SENT: ['ACKNOWLEDGED'],
  ACKNOWLEDGED: ['RESOLVED'],
  RESOLVED: [],
};

export interface AlertProps {
  readonly id: string;
  readonly projectId: string;
  readonly type: AlertType;
  readonly severity: AlertSeverity;
  readonly state: AlertState;
  readonly message: string;
  /** What specifically triggered this (a pond, item, task, batch id) — part of the dedup key (R5). */
  readonly sourceRef: string;
  readonly raisedAt: Date;
  readonly acknowledgedAt: Date | null;
  readonly resolvedAt: Date | null;
  /**
   * TASK-017/R7: set the first (and only) time this alert is re-notified past the CRITICAL SLA —
   * a documented ERD gap this task adds, synced back. `null` until `escalate()` runs; escalation
   * fires exactly once per alert (not a repeating reminder) — a defensible, non-spamming reading
   * of "re-notify/escalate" the module doc's own AC-054 doesn't pin to a specific cadence.
   */
  readonly escalatedAt: Date | null;
}

export class Alert {
  private constructor(private readonly props: AlertProps) {}

  static reconstitute(props: AlertProps): Alert {
    return new Alert(props);
  }

  /** R5: identifies "the same condition" — a project+type+source, independent of any event id. */
  static dedupKey(projectId: string, type: AlertType, sourceRef: string): string {
    return `${projectId}:${type}:${sourceRef}`;
  }

  get id(): string {
    return this.props.id;
  }

  get projectId(): string {
    return this.props.projectId;
  }

  get type(): AlertType {
    return this.props.type;
  }

  get severity(): AlertSeverity {
    return this.props.severity;
  }

  get state(): AlertState {
    return this.props.state;
  }

  get message(): string {
    return this.props.message;
  }

  get sourceRef(): string {
    return this.props.sourceRef;
  }

  get raisedAt(): Date {
    return this.props.raisedAt;
  }

  get acknowledgedAt(): Date | null {
    return this.props.acknowledgedAt;
  }

  get resolvedAt(): Date | null {
    return this.props.resolvedAt;
  }

  get escalatedAt(): Date | null {
    return this.props.escalatedAt;
  }

  get dedupKey(): string {
    return Alert.dedupKey(this.props.projectId, this.props.type, this.props.sourceRef);
  }

  /** R4/edge case 1: a debounced re-breach isn't a duplicate alert while this one is still unresolved. */
  get isActive(): boolean {
    return this.props.state !== 'RESOLVED';
  }

  /** R8/AC-059: Owner always; Worker only for operational types; Partner never. */
  canBeAcknowledgedBy(role: 'OWNER' | 'WORKER' | 'PARTNER'): boolean {
    if (role === 'OWNER') return true;
    if (role === 'WORKER') return OPERATIONAL_ALERT_TYPES.includes(this.props.type);
    return false;
  }

  /** AC-051: only graph-valid transitions are allowed; anything else throws. */
  transitionTo(next: AlertState): Alert {
    if (next === this.props.state) {
      return this;
    }
    if (!VALID_TRANSITIONS[this.props.state].includes(next)) {
      throw new InvalidTransitionError();
    }
    return new Alert({
      ...this.props,
      state: next,
      acknowledgedAt: next === 'ACKNOWLEDGED' ? new Date() : this.props.acknowledgedAt,
      resolvedAt: next === 'RESOLVED' ? new Date() : this.props.resolvedAt,
    });
  }

  /** Edge case 4: acknowledging an already-acknowledged/resolved alert is an idempotent no-op. */
  acknowledge(): Alert {
    if (this.props.state === 'ACKNOWLEDGED' || this.props.state === 'RESOLVED') {
      return this;
    }
    return this.transitionTo('ACKNOWLEDGED');
  }

  /** R4: "create/uplift" — a re-breach with a higher severity raises this alert's severity in place. */
  upliftSeverity(candidate: AlertSeverity): Alert {
    if (SEVERITY_RANK[candidate] <= SEVERITY_RANK[this.props.severity]) {
      return this;
    }
    return new Alert({ ...this.props, severity: candidate });
  }

  /** R7/AC-054: marks this alert as having been re-notified past the SLA. Idempotent — escalating
   * an already-escalated alert is a no-op, never repeatedly re-set. */
  escalate(): Alert {
    if (this.props.escalatedAt !== null) {
      return this;
    }
    return new Alert({ ...this.props, escalatedAt: new Date() });
  }
}
