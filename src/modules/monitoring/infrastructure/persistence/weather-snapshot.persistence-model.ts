import { Column, Entity, Index } from 'typeorm';
import { BaseProjectOwnedPersistenceModel } from '../../../../platform/persistence/base-project-owned.persistence-model';
import type { WeatherForecastDay } from '../../domain/weather-forecast-day';

/**
 * `weather_snapshot` table (TASK-036, ERD `WEATHER_SNAPSHOT`, ADR-018). Project-owned (R9).
 * Extra W-16 metric columns (humidity/wind/rain/feels-like) + forecast_json are nullable so
 * older seed/cache rows remain readable until the next OpenWeather refresh.
 */
@Entity('weather_snapshot')
@Index(['projectId'], { unique: true })
export class WeatherSnapshotPersistenceModel extends BaseProjectOwnedPersistenceModel {
  @Column('double precision', { name: 'temp_c' })
  tempC!: number;

  @Column('varchar')
  condition!: string;

  @Column('boolean', { name: 'heavy_rain' })
  heavyRain!: boolean;

  @Column('boolean', { name: 'extreme_heat' })
  extremeHeat!: boolean;

  @Column('timestamptz', { name: 'fetched_at' })
  fetchedAt!: Date;

  @Column('jsonb', { name: 'forecast_json', nullable: true })
  forecastJson!: WeatherForecastDay[] | null;

  @Column('double precision', { name: 'humidity_pct', nullable: true })
  humidityPct!: number | null;

  @Column('double precision', { name: 'wind_kmh', nullable: true })
  windKmh!: number | null;

  @Column('varchar', { name: 'wind_dir', nullable: true })
  windDir!: string | null;

  @Column('double precision', { name: 'rain_mm', nullable: true })
  rainMm!: number | null;

  @Column('double precision', { name: 'feels_like_c', nullable: true })
  feelsLikeC!: number | null;
}
