import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import type { AppEnv } from '../../src/platform/config/env.validation';

type DbEnv = Pick<AppEnv, 'DB_HOST' | 'DB_PORT' | 'DB_USERNAME' | 'DB_PASSWORD' | 'DB_NAME'>;

/**
 * The only thing every integration/e2e suite does with the handle is `await container?.stop()`,
 * so both backends below satisfy this and nothing else needs to know which one is running.
 */
export interface DisposablePostgres {
  stop(): Promise<void>;
}

/**
 * `container` (default) uses testcontainers; `local` uses an already-running Postgres. `auto`
 * prefers a container and falls back to local when no container runtime is reachable.
 */
type Backend = 'auto' | 'container' | 'local';

function selectedBackend(): Backend {
  const raw = process.env.FMS_TEST_DB;
  return raw === 'container' || raw === 'local' ? raw : 'auto';
}

/**
 * Cap on any admin statement (CREATE/DROP DATABASE) and on connecting. Comfortably above a
 * healthy operation (single-digit ms locally) and well inside a suite's 60s `beforeAll` budget,
 * so a stall surfaces as a named Postgres error rather than an unexplained suite timeout.
 */
const ADMIN_TIMEOUT_MS = 15_000;

/** Local-Postgres connection details; defaults mirror `.env.example`. */
function localAdminConfig() {
  return {
    host: process.env.TEST_DB_HOST ?? '127.0.0.1',
    port: Number(process.env.TEST_DB_PORT ?? 5432),
    user: process.env.TEST_DB_USERNAME ?? 'postgres',
    password: process.env.TEST_DB_PASSWORD ?? '123456',
    database: process.env.TEST_DB_ADMIN_DATABASE ?? 'postgres',
  };
}

/**
 * Creates a uniquely-named, empty database on an already-running Postgres and drops it on
 * `stop()`.
 *
 * This preserves exactly what these suites are actually asserting — real migrations, real DDL,
 * real constraints and indexes against a real Postgres — and only gives up the *containerised*
 * part. Isolation is if anything stronger than the shared-container arrangement: every suite,
 * including every parallel Jest worker, gets its own database.
 */
async function startLocalPostgres(): Promise<{ container: DisposablePostgres; dbEnv: DbEnv }> {
  const admin = localAdminConfig();
  // Lowercase, <= 63 chars, and prefixed so a leaked database is obvious and easy to sweep up.
  const database = `fms_test_${randomUUID().replace(/-/g, '').slice(0, 20)}`;

  const adminClient = new Client({ ...admin, connectionTimeoutMillis: ADMIN_TIMEOUT_MS });
  await adminClient.connect();
  try {
    // Fail fast and loudly if CREATE/DROP ever blocks. A `beforeAll` that stalls here just
    // exhausts the suite's 60s budget and reports an opaque timeout with no cause; a statement
    // timeout turns the same situation into a real Postgres error naming the blocked statement.
    await adminClient.query(`SET statement_timeout = ${ADMIN_TIMEOUT_MS}`);
    await adminClient.query(`SET lock_timeout = ${ADMIN_TIMEOUT_MS}`);
    // TEMPLATE template0 avoids serialising behind anything connected to template1.
    await adminClient.query(`CREATE DATABASE "${database}" TEMPLATE template0`);
  } finally {
    await adminClient.end();
  }

  return {
    container: {
      async stop(): Promise<void> {
        const cleanupClient = new Client({ ...admin, connectionTimeoutMillis: ADMIN_TIMEOUT_MS });
        await cleanupClient.connect();
        try {
          await cleanupClient.query(`SET statement_timeout = ${ADMIN_TIMEOUT_MS}`);
          await cleanupClient.query(`SET lock_timeout = ${ADMIN_TIMEOUT_MS}`);
          // FORCE (Postgres 13+) evicts connections the app's pool may not have released yet.
          await cleanupClient.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
        } catch {
          // Older Postgres: evict backends explicitly, then drop.
          await cleanupClient.query(
            `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1`,
            [database],
          );
          await cleanupClient.query(`DROP DATABASE IF EXISTS "${database}"`);
        } finally {
          await cleanupClient.end();
        }
      },
    },
    dbEnv: {
      DB_HOST: admin.host,
      DB_PORT: admin.port,
      DB_USERNAME: admin.user,
      DB_PASSWORD: admin.password,
      DB_NAME: database,
    },
  };
}

async function startContainerPostgres(): Promise<{ container: DisposablePostgres; dbEnv: DbEnv }> {
  const container = await new PostgreSqlContainer('postgres:15-alpine')
    .withDatabase('fms_test')
    .withUsername('fms')
    .withPassword('fms_test_pw')
    .start();

  return {
    container: {
      stop: async () => {
        await container.stop();
      },
    },
    dbEnv: {
      DB_HOST: container.getHost(),
      DB_PORT: container.getPort(),
      DB_USERNAME: container.getUsername(),
      DB_PASSWORD: container.getPassword(),
      DB_NAME: container.getDatabase(),
    },
  };
}

let announced = false;

/** Announced once per Jest worker so a run never silently misleads about which backend it used. */
function announce(message: string): void {
  if (announced) return;
  announced = true;
  // eslint-disable-next-line no-console
  console.info(`[test-db] ${message}`);
}

/**
 * Provides a real, disposable Postgres for integration tests ("a real Postgres (test container)"
 * per TECHNICAL_SPECIFICATION §17).
 *
 * A container is still the default and what CI should use. But testcontainers hard-fails with
 * "Could not find a working container runtime strategy" on any machine without Docker/Podman,
 * which took out all 29 integration and e2e suites at once — every isolation, RBAC and migration
 * proof in the project — on a developer machine where a perfectly good Postgres was running the
 * whole time. Falling back keeps those proofs executable instead of skipped.
 *
 * Force one backend with `FMS_TEST_DB=container` (recommended in CI, so a missing runtime fails
 * loudly rather than quietly changing what was tested) or `FMS_TEST_DB=local`.
 */
export async function startTestPostgres(): Promise<{
  container: DisposablePostgres;
  dbEnv: DbEnv;
}> {
  const backend = selectedBackend();

  if (backend === 'local') {
    announce('FMS_TEST_DB=local — using the already-running Postgres.');
    return startLocalPostgres();
  }

  try {
    const started = await startContainerPostgres();
    announce('using a disposable Postgres container (testcontainers).');
    return started;
  } catch (error) {
    if (backend === 'container') {
      throw error;
    }
    const reason = error instanceof Error ? error.message : String(error);
    announce(
      `no container runtime available (${reason}) — falling back to the local Postgres at ` +
        `${localAdminConfig().host}:${localAdminConfig().port}. Set FMS_TEST_DB=container to ` +
        'require a container instead.',
    );
    return startLocalPostgres();
  }
}
