import { Column, Entity, Index } from 'typeorm';
import { BaseProjectOwnedPersistenceModel } from '../../../../platform/persistence/base-project-owned.persistence-model';

/**
 * `treatment` table (TASK-028, ERD `TREATMENT`). Project-owned (R9). `export_safe_after` is
 * ERD's own "derived" annotation — computed from `administered_on` + `withdrawal_days`, never
 * persisted (`Treatment.exportSafeAfter` getter).
 */
@Entity('treatment')
export class TreatmentPersistenceModel extends BaseProjectOwnedPersistenceModel {
  @Index()
  @Column('uuid', { name: 'batch_id' })
  batchId!: string;

  @Column('varchar')
  product!: string;

  @Column('varchar')
  dose!: string;

  @Column('date', { name: 'administered_on' })
  administeredOn!: Date;

  @Column('int', { name: 'withdrawal_days' })
  withdrawalDays!: number;

  @Column('timestamptz', { name: 'created_at', default: () => 'now()' })
  createdAt!: Date;
}
