export type TaskStatus = 'SCHEDULED' | 'DUE' | 'DONE' | 'MISSED';

/**
 * Pure domain `Task` (TASK-041, MOD-12 §4.3/F5, ERD `TASK`). `dueOn` is server-computed, never
 * client-supplied (`CreateTask` carries no `dueOn` field) — a freshly defined task is due
 * immediately (today), matching the farm-management intuition that a newly scheduled recurring
 * chore (chain-drag, liming…) should start now, not at some unstated future date the spec never
 * names. A documented judgment call — no business rule pins the initial due date.
 */
export interface TaskProps {
  readonly id: string;
  readonly projectId: string;
  readonly pondId: string | null;
  readonly title: string;
  readonly recurrenceDays: number | null;
  readonly status: TaskStatus;
  readonly dueOn: Date;
}

export class Task {
  private constructor(private readonly props: TaskProps) {}

  static reconstitute(props: TaskProps): Task {
    return new Task(props);
  }

  /** A freshly defined task is immediately actionable — `dueOn = today`, `status = 'DUE'`. */
  static create(props: {
    id: string;
    projectId: string;
    pondId: string | null;
    title: string;
    recurrenceDays: number | null;
    today: Date;
  }): Task {
    return new Task({
      id: props.id,
      projectId: props.projectId,
      pondId: props.pondId,
      title: props.title,
      recurrenceDays: props.recurrenceDays,
      status: 'DUE',
      dueOn: startOfUtcDay(props.today),
    });
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
    const next: TaskStatus = dueDay < todayDay ? 'MISSED' : dueDay.getTime() === todayDay.getTime() ? 'DUE' : 'SCHEDULED';
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
