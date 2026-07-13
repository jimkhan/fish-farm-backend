import { Column, Entity, Index } from 'typeorm';
import { BaseProjectOwnedPersistenceModel } from '../../../../platform/persistence/base-project-owned.persistence-model';

/** `task_log` table (TASK-041, ERD `TASK_LOG`). Project-owned. */
@Entity('task_log')
export class TaskLogPersistenceModel extends BaseProjectOwnedPersistenceModel {
  @Index()
  @Column('uuid', { name: 'task_id' })
  taskId!: string;

  @Column('timestamptz', { name: 'completed_at' })
  completedAt!: Date;

  @Column('varchar', { name: 'photo_url', nullable: true })
  photoUrl!: string | null;

  @Index({ unique: true })
  @Column('varchar', { name: 'client_mutation_id' })
  clientMutationId!: string;
}
