import { Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import { validateEnv } from './env.validation';

/**
 * Global configuration. Loads env, validates it fail-fast (AC-002), and exposes a typed
 * ConfigService everywhere. `isGlobal` so no module re-imports it.
 */
@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnv,
    }),
  ],
})
export class ConfigModule {}
