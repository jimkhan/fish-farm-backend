import { Column, Entity, Index } from 'typeorm';
import { BaseProjectOwnedPersistenceModel } from '../../../../platform/persistence/base-project-owned.persistence-model';
import { WaterParameter } from '../../domain/water-reading.entity';

/** `water_threshold` table (TASK-023, ERD `WATER_THRESHOLD`). Project-owned (R9), one row per
 * configured parameter — unconfigured parameters simply have no row (fall back to seeded
 * defaults, `GetThresholdsUseCase`). */
@Entity('water_threshold')
export class WaterThresholdPersistenceModel extends BaseProjectOwnedPersistenceModel {
  @Index()
  @Column('varchar')
  parameter!: WaterParameter;

  @Column('double precision', { nullable: true })
  min!: number | null;

  @Column('double precision', { nullable: true })
  max!: number | null;

  @Column('double precision', { nullable: true })
  critical!: number | null;
}
