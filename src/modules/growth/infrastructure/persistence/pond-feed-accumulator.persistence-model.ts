import { Column, Entity, Index } from 'typeorm';
import { BaseProjectOwnedPersistenceModel } from '../../../../platform/persistence/base-project-owned.persistence-model';

/**
 * `pond_feed_accumulator` (TASK-030, MOD-07 §4.3, ERD note). A rebuildable projection over
 * `feeding_log` — maintained incrementally by `OnFeedingLoggedHandler`, not a source of truth in
 * its own right. Project-owned (R9).
 */
@Entity('pond_feed_accumulator')
export class PondFeedAccumulatorPersistenceModel extends BaseProjectOwnedPersistenceModel {
  @Index({ unique: true })
  @Column('uuid', { name: 'pond_id' })
  pondId!: string;

  @Column('double precision', { name: 'total_feed_kg', default: 0 })
  totalFeedKg!: number;
}
