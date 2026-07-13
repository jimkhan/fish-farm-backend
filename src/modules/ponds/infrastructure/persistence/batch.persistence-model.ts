import { Column, Entity, Index } from 'typeorm';
import { BaseProjectOwnedPersistenceModel } from '../../../../platform/persistence/base-project-owned.persistence-model';
import { BatchStatus } from '../../domain/batch.entity';

/**
 * `batch` table (TASK-019, ERD `BATCH` + `harvested_count`/`stocking_id` — a documented ERD gap
 * this task closes, see `batch.entity.ts`). Project-owned (R1).
 */
@Entity('batch')
export class BatchPersistenceModel extends BaseProjectOwnedPersistenceModel {
  @Index()
  @Column('uuid', { name: 'pond_id' })
  pondId!: string;

  @Index({ unique: true })
  @Column('uuid', { name: 'stocking_id' })
  stockingId!: string;

  @Index()
  @Column('uuid', { name: 'species_id' })
  speciesId!: string;

  @Column('int', { name: 'initial_count' })
  initialCount!: number;

  @Column('int', { name: 'cumulative_mortality', default: 0 })
  cumulativeMortality!: number;

  @Column('int', { name: 'harvested_count', default: 0 })
  harvestedCount!: number;

  @Column('double precision', { name: 'latest_avg_weight_g', nullable: true })
  latestAvgWeightG!: number | null;

  @Column('varchar', { default: 'ACTIVE' })
  status!: BatchStatus;

  @Column('date', { name: 'stocked_on' })
  stockedOn!: Date;

  @Column('timestamptz', { name: 'created_at', default: () => 'now()' })
  createdAt!: Date;
}
