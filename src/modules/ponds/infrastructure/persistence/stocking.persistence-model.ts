import { Column, Entity, Index } from 'typeorm';
import { BaseProjectOwnedPersistenceModel } from '../../../../platform/persistence/base-project-owned.persistence-model';
import { StockingSource } from '../../domain/stocking.entity';

/** `stocking` table (TASK-019, ERD `STOCKING`). Project-owned (R1). */
@Entity('stocking')
export class StockingPersistenceModel extends BaseProjectOwnedPersistenceModel {
  @Index()
  @Column('uuid', { name: 'pond_id' })
  pondId!: string;

  @Index()
  @Column('uuid', { name: 'species_id' })
  speciesId!: string;

  @Column('varchar', { nullable: true })
  source!: StockingSource | null;

  @Column('varchar', { name: 'hatchery_name', nullable: true })
  hatcheryName!: string | null;

  @Column('int')
  count!: number;

  @Column('date', { name: 'stocked_on' })
  stockedOn!: Date;

  @Column('int', { name: 'stocking_cost_minor', nullable: true })
  stockingCostMinor!: number | null;

  @Column('varchar', { nullable: true })
  currency!: 'BDT' | null;

  @Column('timestamptz', { name: 'created_at', default: () => 'now()' })
  createdAt!: Date;
}
