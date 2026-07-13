import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { LandUnit, ProjectStatus } from '../../domain/project.entity';

/**
 * `project` table (TASK-011, ERD `PROJECT`). Not project-owned — `Project` IS the tenant
 * boundary, so this does NOT extend `BaseProjectOwnedPersistenceModel` (allowlisted in the
 * project-owned schema test, TASK-004 AC-010, same reasoning as `UserPersistenceModel`).
 */
@Entity('project')
export class ProjectPersistenceModel {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('varchar')
  name!: string;

  // `double precision`, not `decimal` — TypeORM maps Postgres `decimal` to a string at runtime
  // (arbitrary-precision safety) to avoid float rounding, which geo coordinates don't need.
  @Column('double precision', { name: 'site_lat' })
  siteLat!: number;

  @Column('double precision', { name: 'site_lng' })
  siteLng!: number;

  @Column('varchar', { nullable: true })
  address!: string | null;

  @Column('varchar', { default: 'BDT' })
  currency!: 'BDT';

  @Column('varchar', { name: 'land_unit', default: 'BIGHA' })
  landUnit!: LandUnit;

  @Column('varchar', { default: 'ACTIVE' })
  status!: ProjectStatus;

  @Column('timestamptz', { name: 'created_at', default: () => 'now()' })
  createdAt!: Date;
}
