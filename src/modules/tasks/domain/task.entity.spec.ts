import { Task } from './task.entity';

describe('Task entity (TASK-041, F5/F6, R10, AC-134/135)', () => {
  describe('create', () => {
    it('a freshly created task is DUE today', () => {
      const task = Task.create({
        id: 't-1',
        projectId: 'p-1',
        pondId: null,
        title: 'Chain drag',
        recurrenceDays: null,
        today: new Date('2026-02-15T10:00:00Z'),
      });
      expect(task.status).toBe('DUE');
      expect(task.dueOn.toISOString()).toBe('2026-02-15T00:00:00.000Z');
      expect(task.assigneeUserId).toBeNull();
    });

    it('a future dueOn lands as SCHEDULED', () => {
      const task = Task.create({
        id: 't-1',
        projectId: 'p-1',
        pondId: null,
        title: 'Liming',
        recurrenceDays: 15,
        today: new Date('2026-02-15T10:00:00Z'),
        dueOn: new Date('2026-03-01T00:00:00Z'),
        assigneeUserId: 'u-worker',
      });
      expect(task.status).toBe('SCHEDULED');
      expect(task.dueOn.toISOString()).toBe('2026-03-01T00:00:00.000Z');
      expect(task.assigneeUserId).toBe('u-worker');
    });
  });

  describe('update', () => {
    it('updates definition fields and recomputes status when dueOn changes', () => {
      const task = Task.reconstitute({
        id: 't-1',
        projectId: 'p-1',
        pondId: null,
        title: 'Chain drag',
        recurrenceDays: 7,
        status: 'DUE',
        dueOn: new Date('2026-02-15T00:00:00Z'),
        assigneeUserId: null,
      });
      const updated = task.update(
        {
          title: 'Chain drag (deep)',
          dueOn: new Date('2026-03-01T00:00:00Z'),
          assigneeUserId: 'u-1',
          recurrenceDays: 10,
        },
        new Date('2026-02-15T12:00:00Z'),
      );
      expect(updated.title).toBe('Chain drag (deep)');
      expect(updated.status).toBe('SCHEDULED');
      expect(updated.dueOn.toISOString()).toBe('2026-03-01T00:00:00.000Z');
      expect(updated.assigneeUserId).toBe('u-1');
      expect(updated.recurrenceDays).toBe(10);
    });

    it('clears assignee when null is passed', () => {
      const task = Task.reconstitute({
        id: 't-1',
        projectId: 'p-1',
        pondId: null,
        title: 'Liming',
        recurrenceDays: 15,
        status: 'DUE',
        dueOn: new Date('2026-02-15T00:00:00Z'),
        assigneeUserId: 'u-1',
      });
      const updated = task.update({ assigneeUserId: null }, new Date('2026-02-15T12:00:00Z'));
      expect(updated.assigneeUserId).toBeNull();
      expect(updated.status).toBe('DUE');
    });
  });

  describe('recomputeStatus', () => {
    it('SCHEDULED -> DUE once the due date arrives', () => {
      const task = Task.reconstitute({
        id: 't-1',
        projectId: 'p-1',
        pondId: null,
        title: 'Liming',
        recurrenceDays: 15,
        status: 'SCHEDULED',
        dueOn: new Date('2026-02-15T00:00:00Z'),
        assigneeUserId: null,
      });
      const recomputed = task.recomputeStatus(new Date('2026-02-15T09:00:00Z'));
      expect(recomputed.status).toBe('DUE');
    });

    it('DUE -> MISSED once the due date passes uncompleted', () => {
      const task = Task.reconstitute({
        id: 't-1',
        projectId: 'p-1',
        pondId: null,
        title: 'Water exchange',
        recurrenceDays: null,
        status: 'DUE',
        dueOn: new Date('2026-02-10T00:00:00Z'),
        assigneeUserId: null,
      });
      const recomputed = task.recomputeStatus(new Date('2026-02-12T00:00:00Z'));
      expect(recomputed.status).toBe('MISSED');
    });

    it('stays SCHEDULED before the due date arrives', () => {
      const task = Task.reconstitute({
        id: 't-1',
        projectId: 'p-1',
        pondId: null,
        title: 'Liming',
        recurrenceDays: 15,
        status: 'SCHEDULED',
        dueOn: new Date('2026-03-01T00:00:00Z'),
        assigneeUserId: null,
      });
      const recomputed = task.recomputeStatus(new Date('2026-02-15T00:00:00Z'));
      expect(recomputed.status).toBe('SCHEDULED');
    });

    it('DONE is terminal — never recomputed even long past due', () => {
      const task = Task.reconstitute({
        id: 't-1',
        projectId: 'p-1',
        pondId: null,
        title: 'One-off',
        recurrenceDays: null,
        status: 'DONE',
        dueOn: new Date('2026-01-01T00:00:00Z'),
        assigneeUserId: null,
      });
      const recomputed = task.recomputeStatus(new Date('2026-06-01T00:00:00Z'));
      expect(recomputed.status).toBe('DONE');
    });
  });

  describe('complete', () => {
    it('a one-off task (no recurrence) becomes terminally DONE', () => {
      const task = Task.reconstitute({
        id: 't-1',
        projectId: 'p-1',
        pondId: null,
        title: 'One-off',
        recurrenceDays: null,
        status: 'DUE',
        dueOn: new Date('2026-02-15T00:00:00Z'),
        assigneeUserId: 'u-1',
      });
      const completed = task.complete(new Date('2026-02-15T14:00:00Z'));
      expect(completed.status).toBe('DONE');
      expect(completed.dueOn).toEqual(task.dueOn);
      expect(completed.assigneeUserId).toBe('u-1');
    });

    it('a recurring task rolls its due date forward from the completion date, not the original due date', () => {
      const task = Task.reconstitute({
        id: 't-1',
        projectId: 'p-1',
        pondId: null,
        title: 'Chain drag',
        recurrenceDays: 10,
        status: 'MISSED', // completed 5 days late
        dueOn: new Date('2026-02-10T00:00:00Z'),
        assigneeUserId: null,
      });
      const completedOn = new Date('2026-02-15T00:00:00Z'); // 5 days late
      const completed = task.complete(completedOn);
      // next due = completion date + 10 days, not original-due + 10 (avoids drift).
      expect(completed.dueOn.toISOString()).toBe('2026-02-25T00:00:00.000Z');
      expect(completed.status).toBe('SCHEDULED');
    });

    it('a recurring task completed on its due date recomputes to DUE if the new date is also today', () => {
      const task = Task.reconstitute({
        id: 't-1',
        projectId: 'p-1',
        pondId: null,
        title: 'Daily-ish',
        recurrenceDays: 0,
        status: 'DUE',
        dueOn: new Date('2026-02-15T00:00:00Z'),
        assigneeUserId: null,
      });
      const completed = task.complete(new Date('2026-02-15T00:00:00Z'));
      expect(completed.dueOn.toISOString()).toBe('2026-02-15T00:00:00.000Z');
      expect(completed.status).toBe('DUE');
    });
  });
});
