import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import type { AppEnv } from '../../src/platform/config/env.validation';

/**
 * Starts a disposable Postgres container for integration tests ("a real Postgres (test
 * container)" per TECHNICAL_SPECIFICATION §17). Every module's integration suite can reuse this
 * instead of depending on a pre-existing local database.
 */
export async function startTestPostgres(): Promise<{
  container: StartedPostgreSqlContainer;
  dbEnv: Pick<AppEnv, 'DB_HOST' | 'DB_PORT' | 'DB_USERNAME' | 'DB_PASSWORD' | 'DB_NAME'>;
}> {
  const container = await new PostgreSqlContainer('postgres:15-alpine')
    .withDatabase('fms_test')
    .withUsername('fms')
    .withPassword('fms_test_pw')
    .start();

  return {
    container,
    dbEnv: {
      DB_HOST: container.getHost(),
      DB_PORT: container.getPort(),
      DB_USERNAME: container.getUsername(),
      DB_PASSWORD: container.getPassword(),
      DB_NAME: container.getDatabase(),
    },
  };
}
