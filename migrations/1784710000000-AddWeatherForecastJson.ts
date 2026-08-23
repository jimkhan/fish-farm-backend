import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

/** Cached OpenWeather 5-day forecast strip for W-16 (alongside current snapshot). */
export class AddWeatherForecastJson1784710000000 implements MigrationInterface {
  name = 'AddWeatherForecastJson1784710000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'weather_snapshot',
      new TableColumn({
        name: 'forecast_json',
        type: 'jsonb',
        isNullable: true,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('weather_snapshot', 'forecast_json');
  }
}
