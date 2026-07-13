import { Column, Entity, Index } from 'typeorm';
import { BaseProjectOwnedPersistenceModel } from '../../../../platform/persistence/base-project-owned.persistence-model';
import { FeedObservation } from '../../domain/feeding-log.entity';

/** `feeding_log` table (TASK-022, ERD `FEEDING_LOG`). Project-owned (R7). */
@Entity('feeding_log')
export class FeedingLogPersistenceModel extends BaseProjectOwnedPersistenceModel {
  @Index()
  @Column('uuid', { name: 'batch_id' })
  batchId!: string;

  @Index()
  @Column('uuid', { name: 'inventory_item_id' })
  inventoryItemId!: string;

  @Column('double precision', { name: 'qty_kg' })
  qtyKg!: number;

  @Column('varchar', { nullable: true })
  observation!: FeedObservation | null;

  @Column('timestamptz', { name: 'fed_at' })
  fedAt!: Date;

  @Index({ unique: true })
  @Column('varchar', { name: 'client_mutation_id' })
  clientMutationId!: string;

  @Column('timestamptz', { name: 'created_at', default: () => 'now()' })
  createdAt!: Date;
}
