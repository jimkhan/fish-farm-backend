import { Column, Entity, Index } from 'typeorm';
import { BaseProjectOwnedPersistenceModel } from '../../../../platform/persistence/base-project-owned.persistence-model';
import { TaskStatus } from '../../domain/task.entity';

/** `task` table (TASK-041, ERD `TASK`). Project-owned (module doc §2.4 R9). */
@Entity('task')
export class TaskPersistenceModel extends BaseProjectOwnedPersistenceModel {
  @Column('uuid', { name: 'pond_id', nullable: true })
  pondId!: string | null;

  @Column('varchar')
  title!: string;

  @Column('int', { name: 'recurrence_days', nullable: true })
  recurrenceDays!: number | null;

  @Index()
  @Column('varchar')
  status!: TaskStatus;

  @Index()
  @Column('date', { name: 'due_on' })
  dueOn!: Date;
}
