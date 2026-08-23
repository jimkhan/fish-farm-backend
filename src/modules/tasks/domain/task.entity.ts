export type TaskStatus = 'SCHEDULED' | 'DUE' | 'DONE' | 'MISSED';

/**
 * Pure domain `Task` (TASK-041, MOD-12 §4.3/F5, ERD `TASK`). `dueOn` may be supplied on create
 * (optional client date); omitted → today. Recurring completions still roll `dueOn` forward
 * from the completion date. `assigneeUserId` is informational (any canWrite may complete).
 */
export interface TaskProps {
  readonly id: string;
  readonly projectId: string;
  readonly pondId: string | null;
  readonly title: string;
  readonly recurrenceDays: number | null;
  readonly status: TaskStatus;
  readonly dueOn: Date;
  readonly assigneeUserId: string | null;
}

export class Task {
  private constructor(private readonly props: TaskProps) {}

  static reconstitute(props: TaskProps): Task {
    return new Task(props);
  }

  /**
   * Creates a task due on `dueOn` (or today when omitted). Status is derived via
   * {@link recomputeStatus} so a future due date lands as `SCHEDULED`.
   */
  static create(props: {
    id: string;
    projectId: string;
    pondId: string | null;
    title: string;
    recurrenceDays: number | null;
    today: Date;
    dueOn?: Date;
    assigneeUserId?: string | null;
  }): Task {
    const dueOn = startOfUtcDay(props.dueOn ?? props.today);
    const draft = new Task({
      id: props.id,
      projectId: props.projectId,
      pondId: props.pondId,
      title: props.title,
      recurrenceDays: props.recurrenceDays,
      status: 'DUE',
      dueOn,
      assigneeUserId: props.assigneeUserId ?? null,
    });
    return draft.recomputeStatus(props.today);
  }

  get id(): string {
    return this.props.id;
  }

  get projectId(): string {
    return this.props.projectId;
  }

  get pondId(): string | null {
    return this.props.pondId;
  }

  get title(): string {
    return this.props.title;
  }

  get recurrenceDays(): number | null {
    return this.props.recurrenceDays;
  }

  get status(): TaskStatus {
    return this.props.status;
  }

  get dueOn(): Date {
    return this.props.dueOn;
  }

  get assigneeUserId(): string | null {
    return this.props.assigneeUserId;
  }

  /**
   * Owner manage — partial update of definition fields. Changing `dueOn` recomputes status
   * against `today`. `DONE` one-offs stay terminal (status not recomputed).
   */
  update(
    patch: {
      title?: string;
      pondId?: string | null;
      recurrenceDays?: number | null;
      dueOn?: Date;
      assigneeUserId?: string | null;
    },
    today: Date,
  ): Task {
    const next = new Task({
      ...this.props,
      title: patch.title ?? this.props.title,
      pondId: patch.pondId !== undefined ? patch.pondId : this.props.pondId,
      recurrenceDays:
        patch.recurrenceDays !== undefined ? patch.recurrenceDays : this.props.recurrenceDays,
      dueOn: patch.dueOn !== undefined ? startOfUtcDay(patch.dueOn) : this.props.dueOn,
      assigneeUserId:
        patch.assigneeUserId !== undefined ? patch.assigneeUserId : this.props.assigneeUserId,
    });
    return patch.dueOn !== undefined ? next.recomputeStatus(today) : next;
  }

  /**
   * F5/R10 (AC-135): recomputes status against `today` (UTC calendar day) — `SCHEDULED→DUE` once
   * the due date arrives, `DUE→MISSED` once it passes uncompleted. `DONE` is terminal for a
   * one-off task and never recomputed (a completed recurring task is rolled forward by
   * {@link complete} instead, so it is never left `DONE` with a stale due date).
   */
  recomputeStatus(today: Date): Task {
    if (this.props.status === 'DONE') {
      return this;
    }
    const dueDay = startOfUtcDay(this.props.dueOn);
    const todayDay = startOfUtcDay(today);
    const next: TaskStatus =
      dueDay < todayDay ? 'MISSED' : dueDay.getTime() === todayDay.getTime() ? 'DUE' : 'SCHEDULED';
    return next === this.props.status ? this : new Task({ ...this.props, status: next });
  }

  /**
   * F6 (AC-134): a one-off task (`recurrenceDays === null`) becomes terminally `DONE`; a
   * recurring one rolls its due date forward by `recurrenceDays` from the actual completion date
   * (not the original due date, to avoid drift when a task is completed late) and its status is
   * recomputed against that same date.
   */
  complete(completedOn: Date): Task {
    if (this.props.recurrenceDays === null) {
      return new Task({ ...this.props, status: 'DONE' });
    }
    const nextDueOn = new Date(
      startOfUtcDay(completedOn).getTime() + this.props.recurrenceDays * 86_400_000,
    );
    return new Task({ ...this.props, dueOn: nextDueOn, status: 'SCHEDULED' }).recomputeStatus(
      completedOn,
    );
  }
}

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}
