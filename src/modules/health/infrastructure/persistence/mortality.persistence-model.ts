import { Column, Entity, Index } from 'typeorm';
import { BaseProjectOwnedPersistenceModel } from '../../../../platform/persistence/base-project-owned.persistence-model';

/** `mortality` table (TASK-028, ERD `MORTALITY`). Project-owned (R9). */
@Entity('mortality')
export class MortalityPersistenceModel extends BaseProjectOwnedPersistenceModel {
  @Index()
  @Column('uuid', { name: 'batch_id' })
  batchId!: string;

  @Column('int')
  count!: number;

  @Column('varchar', { name: 'cause_category' })
  causeCategory!: string;

  @Column('varchar', { name: 'photo_url', nullable: true })
  photoUrl!: string | null;

  @Column('timestamptz', { name: 'occurred_at' })
  occurredAt!: Date;

  @Index({ unique: true })
  @Column('varchar', { name: 'client_mutation_id' })
  clientMutationId!: string;

  @Column('timestamptz', { name: 'created_at', default: () => 'now()' })
  createdAt!: Date;
}
