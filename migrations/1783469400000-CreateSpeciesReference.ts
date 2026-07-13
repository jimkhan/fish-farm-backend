import { MigrationInterface, QueryRunner, Table } from 'typeorm';

/**
 * TASK-018: `species` table (FT-018, ERD `SPECIES`) — global reference data, seeded here per the
 * module doc's implementation notes ("seed Species reference data via migration"). Density
 * ranges are left `NULL` — no authoritative lab/advisory source was available at seed time (MOD-04
 * §6.4 open question, default: "seed with sensible defaults, tune later"); a null range reads as
 * "not yet known" rather than fabricating numbers, consistent with how `latest_avg_weight_g`
 * (TASK-019) stays null before the first sampling (R6).
 */
export class CreateSpeciesReference1783469400000 implements MigrationInterface {
  name = 'CreateSpeciesReference1783469400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'species',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, default: 'gen_random_uuid()' },
          { name: 'name', type: 'varchar', isNullable: false },
          { name: 'category', type: 'varchar', isNullable: false },
          { name: 'default_density_min', type: 'double precision', isNullable: true },
          { name: 'default_density_max', type: 'double precision', isNullable: true },
        ],
      }),
      true,
    );

    await queryRunner.query(`
      INSERT INTO species (name, category) VALUES
        ('SPF Golda', 'PRAWN'),
        ('Parse', 'FISH'),
        ('Carp', 'FISH'),
        ('Grass Carp', 'FISH')
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('species');
  }
}
