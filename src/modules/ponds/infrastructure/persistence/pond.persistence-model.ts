import { Column, Entity } from 'typeorm';
import { BaseProjectOwnedPersistenceModel } from '../../../../platform/persistence/base-project-owned.persistence-model';

/**
 * `pond` table (TASK-018, ERD `POND`). Project-owned (R1) — extends the base so `ScopedRepository`
 * composes `project_id` automatically.
 */
@Entity('pond')
export class PondPersistenceModel extends BaseProjectOwnedPersistenceModel {
  @Column('varchar')
  name!: string;

  // `double precision`, not `decimal` — see the identical note on `ProjectPersistenceModel`.
  @Column('double precision')
  area!: number;

  @Column('double precision', { name: 'depth_m', nullable: true })
  depthM!: number | null;

  @Column('varchar', { nullable: true })
  notes!: string | null;

  @Column('timestamptz', { name: 'created_at', default: () => 'now()' })
  createdAt!: Date;
}
