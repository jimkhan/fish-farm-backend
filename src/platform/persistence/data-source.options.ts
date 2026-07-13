import { join } from 'path';
import type { DataSourceOptions } from 'typeorm';
import type { AppEnv } from '../config/env.validation';

export interface BuildDataSourceOptionsConfig {
  /**
   * Whether to declare the `migrations` glob (default `true`, for the CLI's `data-source.ts`).
   * The running app never sets `migrationsRun: true` and never calls `runMigrations()`, so it
   * has no need to load migration files — and on plain `node` (no ts-node registered), eagerly
   * importing a `.ts` migration file at boot has hit a Node ESM/CJS loader race
   * (`ERR_INTERNAL_ASSERTION: Unexpected module status 0`) on newer Node versions, which
   * `@nestjs/typeorm` surfaces as a misleading "Unable to connect to the database" retry loop.
   * `PersistenceModule` passes `false` to avoid the whole class of failure.
   */
  includeMigrations?: boolean;
}

/**
 * Builds the TypeORM `DataSourceOptions` from validated env. `synchronize` is hard-coded `false`
 * — in every environment, unconditionally (AC-012, CLAUDE.md invariant #4). Schema changes are
 * made only through migrations under `migrations/`, run explicitly (`migration:run`), never at
 * boot (`migrationsRun: false`) — matches TECHNICAL_SPECIFICATION §18.
 */
export function buildDataSourceOptions(
  env: Pick<AppEnv, 'DB_HOST' | 'DB_PORT' | 'DB_USERNAME' | 'DB_PASSWORD' | 'DB_NAME'>,
  config: BuildDataSourceOptionsConfig = {},
): DataSourceOptions {
  const { includeMigrations = true } = config;
  return {
    type: 'postgres',
    host: env.DB_HOST,
    port: env.DB_PORT,
    username: env.DB_USERNAME,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
    entities: [
      join(__dirname, '..', '..', 'modules', '**', 'infrastructure', 'persistence', '*.persistence-model.{ts,js}'),
      // Shared-kernel platform tables (audit_entry, …) live outside the module layout.
      join(__dirname, '..', '..', 'shared-kernel', '**', '*.persistence-model.{ts,js}'),
    ],
    ...(includeMigrations && {
      migrations: [join(__dirname, '..', '..', '..', 'migrations', '*.{ts,js}')],
    }),
    synchronize: false,
    migrationsRun: false,
  };
}
