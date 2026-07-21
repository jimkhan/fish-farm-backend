export type PondActionType = 'CHAIN_DRAG' | 'AERATION';

/**
 * Pure domain `PondAction` (TASK-025, MOD-06 F4/R7, ERD `POND_ACTION`, AC-088). Chain-drag
 * (pond-bottom gas management, every 10-15 days) and aeration are logged actions tied to a pond
 * — the recurring *reminder* is a Task (MOD-12, out of scope here per this task's own
 * non-goal); completing that task creating an action record is a separate, later integration.
 */
export interface PondActionProps {
  readonly id: string;
  readonly projectId: string;
  readonly pondId: string;
  readonly actionType: PondActionType;
  readonly performedAt: Date;
  readonly notes: string | null;
  readonly clientMutationId: string;
  readonly createdAt: Date;
}

export class PondAction {
  private constructor(private readonly props: PondActionProps) {}

  static reconstitute(props: PondActionProps): PondAction {
    return new PondAction(props);
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

  get actionType(): PondActionType {
    return this.props.actionType;
  }

  get performedAt(): Date {
    return this.props.performedAt;
  }

  get notes(): string | null {
    return this.props.notes;
  }

  get clientMutationId(): string {
    return this.props.clientMutationId;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }
}
