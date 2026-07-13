export type FeedObservation = 'NORMAL' | 'LEFTOVER' | 'EMPTY';

/**
 * Pure domain `FeedingLog` (TASK-022, MOD-05 §4.3/F5/F6, ERD `FEEDING_LOG`). `observation` is
 * F6's check-tray field (AC-077) — stored on the same row as the feeding it accompanies, not a
 * separate entity/endpoint, matching the ERD/contract shape (`CreateFeedingLog`/`FeedingLog`
 * already carry it, CON-018).
 */
export interface FeedingLogProps {
  readonly id: string;
  readonly projectId: string;
  readonly batchId: string;
  readonly inventoryItemId: string;
  readonly qtyKg: number;
  readonly observation: FeedObservation | null;
  readonly fedAt: Date;
  readonly clientMutationId: string;
  readonly createdAt: Date;
}

export class FeedingLog {
  private constructor(private readonly props: FeedingLogProps) {}

  static reconstitute(props: FeedingLogProps): FeedingLog {
    return new FeedingLog(props);
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

  get inventoryItemId(): string {
    return this.props.inventoryItemId;
  }

  get qtyKg(): number {
    return this.props.qtyKg;
  }

  get observation(): FeedObservation | null {
    return this.props.observation;
  }

  get fedAt(): Date {
    return this.props.fedAt;
  }

  get clientMutationId(): string {
    return this.props.clientMutationId;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }
}
