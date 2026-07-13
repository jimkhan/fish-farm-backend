import { Column, Entity } from 'typeorm';
import { BaseProjectOwnedPersistenceModel } from '../../../../platform/persistence/base-project-owned.persistence-model';
import { FeedType } from '../../domain/inventory-item.entity';

/** `inventory_item` table (TASK-020, ERD `INVENTORY_ITEM`). Project-owned (R7). */
@Entity('inventory_item')
export class InventoryItemPersistenceModel extends BaseProjectOwnedPersistenceModel {
  @Column('varchar')
  name!: string;

  @Column('varchar', { name: 'feed_type', nullable: true })
  feedType!: FeedType | null;

  @Column('varchar')
  unit!: string;

  @Column('double precision', { default: 0 })
  quantity!: number;

  @Column('double precision', { name: 'low_stock_threshold', nullable: true })
  lowStockThreshold!: number | null;

  @Column('timestamptz', { name: 'created_at', default: () => 'now()' })
  createdAt!: Date;
}
