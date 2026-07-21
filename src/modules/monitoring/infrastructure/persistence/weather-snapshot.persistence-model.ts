import { Column, Entity, Index } from 'typeorm';
import { BaseProjectOwnedPersistenceModel } from '../../../../platform/persistence/base-project-owned.persistence-model';

/**
 * `weather_snapshot` table (TASK-036, ERD `WEATHER_SNAPSHOT`, ADR-018). Project-owned (R9).
 *
 * **Deliberate, minor ERD divergence**: ERD models `project_id` itself as the primary key (a
 * pure 1:1 cache row). This extends `BaseProjectOwnedPersistenceModel` instead (its own `id` PK
 * + a *unique*-indexed `project_id`) so the read path can go through the sanctioned
 * `ScopedRepository` — MOD-01 R2 explicitly forbids raw `Repository`/query-builder access to
 * project-owned tables, and `ScopedRepository<T>` is generically constrained to
 * `BaseProjectOwnedPersistenceModel`. The `UNIQUE` index still enforces ERD's real invariant (at
 * most one row per project) — same 1:1 guarantee, different physical key. No `stale` column is
 * persisted — see `GetWeatherUseCase`'s doc comment for why it's computed live instead.
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
}
