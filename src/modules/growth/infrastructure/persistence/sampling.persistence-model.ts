import { Column, Entity, Index } from 'typeorm';
import { BaseProjectOwnedPersistenceModel } from '../../../../platform/persistence/base-project-owned.persistence-model';

/** `sampling` table (TASK-029, ERD `SAMPLING`). Project-owned (R9). */
@Entity('sampling')
export class SamplingPersistenceModel extends BaseProjectOwnedPersistenceModel {
  @Index()
  @Column('uuid', { name: 'batch_id' })
  batchId!: string;

  @Column('int', { name: 'sample_size' })
  sampleSize!: number;

  @Column('double precision', { name: 'avg_weight_g' })
  avgWeightG!: number;

  @Column('date', { name: 'sampled_on' })
  sampledOn!: Date;

  @Index({ unique: true })
  @Column('varchar', { name: 'client_mutation_id' })
  clientMutationId!: string;

  @Column('timestamptz', { name: 'created_at', default: () => 'now()' })
  createdAt!: Date;
}
