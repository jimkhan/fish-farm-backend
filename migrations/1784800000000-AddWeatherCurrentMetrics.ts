import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

/** Current-conditions metrics for W-16 (humidity / wind / rain / feels-like). */
export class AddWeatherCurrentMetrics1784800000000 implements MigrationInterface {
  name = 'AddWeatherCurrentMetrics1784800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumns('weather_snapshot', [
      new TableColumn({ name: 'humidity_pct', type: 'double precision', isNullable: true }),
      new TableColumn({ name: 'wind_kmh', type: 'double precision', isNullable: true }),
      new TableColumn({ name: 'wind_dir', type: 'varchar', isNullable: true }),
      new TableColumn({ name: 'rain_mm', type: 'double precision', isNullable: true }),
      new TableColumn({ name: 'feels_like_c', type: 'double precision', isNullable: true }),
    ]);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('weather_snapshot', 'feels_like_c');
    await queryRunner.dropColumn('weather_snapshot', 'rain_mm');
    await queryRunner.dropColumn('weather_snapshot', 'wind_dir');
    await queryRunner.dropColumn('weather_snapshot', 'wind_kmh');
    await queryRunner.dropColumn('weather_snapshot', 'humidity_pct');
  }
}
