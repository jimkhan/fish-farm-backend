import { Column, Entity, Index } from 'typeorm';
import { BaseProjectOwnedPersistenceModel } from '../../../../platform/persistence/base-project-owned.persistence-model';
import { WaterParameter, WaterSource } from '../../domain/water-reading.entity';

/** `water_reading` table (TASK-023, ERD `WATER_READING`). Project-owned (R9). */
@Entity('water_reading')
export class WaterReadingPersistenceModel extends BaseProjectOwnedPersistenceModel {
  @Index()
  @Column('uuid', { name: 'pond_id' })
  pondId!: string;

  @Index()
  @Column('varchar')
  parameter!: WaterParameter;

  @Column('double precision')
  value!: number;

  @Column('varchar')
  source!: WaterSource;

  @Column('uuid', { name: 'device_id', nullable: true })
  deviceId!: string | null;

  @Index()
  @Column('timestamptz', { name: 'read_at' })
  readAt!: Date;

  @Index({ unique: true })
  @Column('varchar', { name: 'client_mutation_id' })
  clientMutationId!: string;

  @Column('timestamptz', { name: 'created_at', default: () => 'now()' })
  createdAt!: Date;
}
