import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { startTestPostgres, type DisposablePostgres } from './support/postgres-test-container';

describe('GET /health (AC-001, CON-047)', () => {
  let app: INestApplication;
  let container: DisposablePostgres;

  beforeAll(async () => {
    const started = await startTestPostgres();
    container = started.container;

    process.env.NODE_ENV = 'test';
    process.env.DB_HOST = started.dbEnv.DB_HOST;
    process.env.DB_PORT = String(started.dbEnv.DB_PORT);
    process.env.DB_USERNAME = started.dbEnv.DB_USERNAME;
    process.env.DB_PASSWORD = started.dbEnv.DB_PASSWORD;
    process.env.DB_NAME = started.dbEnv.DB_NAME;
    process.env.JWT_ACCESS_SECRET = 'test-only-secret-not-for-production-use-0000';

    // Imported dynamically, after env vars are set: AppModule's ConfigModule.forRoot() validates
    // process.env synchronously at import time, so importing it before the container is up (and
    // its connection details are known) would fail even though the eventual env is valid.
    const { AppModule } = await import('../src/app.module');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  }, 60_000);

  afterAll(async () => {
    await app?.close();
    await container?.stop();
  });

  it('returns 200 with status ok and db check ok when the database is reachable', async () => {
    const res = await request(app.getHttpServer()).get('/health');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(typeof res.body.version).toBe('string');
    expect(res.body.checks).toEqual({ db: 'ok' });
  });
});
