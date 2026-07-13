import { Column, Entity, Index } from 'typeorm';
import { BaseProjectOwnedPersistenceModel } from '../../../../platform/persistence/base-project-owned.persistence-model';

/** `inventory_txn` table (TASK-020, ERD `INVENTORY_TXN` + `cost_minor`, a documented gap this
 * task adds — synced back to ERD.md, AC-082/R8). Project-owned (R7). */
@Entity('inventory_txn')
export class InventoryTxnPersistenceModel extends BaseProjectOwnedPersistenceModel {
  @Index()
  @Column('uuid', { name: 'item_id' })
  itemId!: string;

  @Column('double precision')
  delta!: number;

  @Column('varchar')
  reason!: string;

  @Column('int', { name: 'cost_minor', nullable: true })
  costMinor!: number | null;

  @Column('timestamptz', { name: 'occurred_at', default: () => 'now()' })
  occurredAt!: Date;
}
