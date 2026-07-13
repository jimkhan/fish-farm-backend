import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { SpeciesCategory } from '../../domain/species.entity';

/**
 * `species` table (TASK-018, ERD `SPECIES`). Not project-owned — global seeded reference data
 * (R8), allowlisted in the project-owned schema test (TASK-004 AC-010, same reasoning as `User`).
 */
@Entity('species')
export class SpeciesPersistenceModel {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('varchar')
  name!: string;

  @Column('varchar')
  category!: SpeciesCategory;

  @Column('double precision', { name: 'default_density_min', nullable: true })
  defaultDensityMin!: number | null;

  @Column('double precision', { name: 'default_density_max', nullable: true })
  defaultDensityMax!: number | null;
}
