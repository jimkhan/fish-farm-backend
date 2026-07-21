import { Column, Entity, Index } from 'typeorm';
import { BaseProjectOwnedPersistenceModel } from '../../../../platform/persistence/base-project-owned.persistence-model';
import { HarvestGrade } from '../../domain/harvest.entity';

/** `harvest` table (TASK-031, ERD `HARVEST` + `client_mutation_id`, a documented gap this task adds — synced back to ERD.md). Project-owned (R9). */
@Entity('harvest')
export class HarvestPersistenceModel extends BaseProjectOwnedPersistenceModel {
  @Index()
  @Column('uuid', { name: 'batch_id' })
  batchId!: string;

  @Column('int')
  quantity!: number;

  @Column('double precision', { name: 'total_weight_kg' })
  totalWeightKg!: number;

  @Column('varchar')
  grade!: HarvestGrade;

  @Column('date', { name: 'harvested_on' })
  harvestedOn!: Date;

  @Column('int', { name: 'revenue_minor', nullable: true })
  revenueMinor!: number | null;

  @Index({ unique: true })
  @Column('varchar', { name: 'client_mutation_id' })
  clientMutationId!: string;

  @Column('timestamptz', { name: 'created_at', default: () => 'now()' })
  createdAt!: Date;
}
