/**
 * Pure domain `TaskLog` (TASK-041, MOD-12 §4.3/F6, ERD `TASK_LOG`). Append-only, offline-syncable
 * (`client_mutation_id UK`) — one row per completion; a recurring task accumulates many.
 */
export interface TaskLogProps {
  readonly id: string;
  readonly projectId: string;
  readonly taskId: string;
  readonly completedAt: Date;
  readonly photoUrl: string | null;
  readonly clientMutationId: string;
}

export class TaskLog {
  private constructor(private readonly props: TaskLogProps) {}

  static reconstitute(props: TaskLogProps): TaskLog {
    return new TaskLog(props);
  }

  get id(): string {
    return this.props.id;
  }

  get projectId(): string {
    return this.props.projectId;
  }

  get taskId(): string {
    return this.props.taskId;
  }

  get completedAt(): Date {
    return this.props.completedAt;
  }

  get photoUrl(): string | null {
    return this.props.photoUrl;
  }

  get clientMutationId(): string {
    return this.props.clientMutationId;
  }
}
