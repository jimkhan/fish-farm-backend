import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import type { AppEnv } from '../config/env.validation';
import { buildDataSourceOptions } from './data-source.options';

/**
 * Wires the TypeORM Data Mapper connection into Nest's DI (ADR-007, ADR-008). Uses the same
 * `buildDataSourceOptions` the CLI uses, so runtime and migrations never drift apart.
 */
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppEnv, true>) =>
        buildDataSourceOptions(
          {
            DB_HOST: config.get('DB_HOST', { infer: true }),
            DB_PORT: config.get('DB_PORT', { infer: true }),
            DB_USERNAME: config.get('DB_USERNAME', { infer: true }),
            DB_PASSWORD: config.get('DB_PASSWORD', { infer: true }),
            DB_NAME: config.get('DB_NAME', { infer: true }),
          },
          // The app never runs migrations at boot (migrationsRun: false) — see
          // BuildDataSourceOptionsConfig for why this must stay false here.
          { includeMigrations: false },
        ),
    }),
  ],
})
export class PersistenceModule {}
