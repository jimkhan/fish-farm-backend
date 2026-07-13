import { Controller, Get, INestApplication, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { CORRELATION_HEADER } from '../src/shared-kernel/errors/correlation.middleware';
import { ForbiddenError, NotFoundError } from '../src/shared-kernel/errors/domain-error';
import { ErrorsModule } from '../src/shared-kernel/errors/errors.module';

/**
 * Integration test for the error contract (TASK-003, AC-008, NFR-005). Boots a minimal Nest
 * app — no database — with ErrorsModule plus a throwaway controller, and asserts the wire
 * shape of contracts/openapi.yaml `Error` end to end.
 */
@Controller('probe')
class ProbeController {
  @Get('ok')
  ok(): { ok: boolean } {
    return { ok: true };
  }

  @Get('missing')
  missing(): never {
    throw new NotFoundError('Pond not found', { pondId: 'p-1' });
  }

  @Get('forbidden')
  forbidden(): never {
    throw new ForbiddenError();
  }

  @Get('boom')
  boom(): never {
    throw new Error('secret internal detail');
  }
}

@Module({ imports: [ErrorsModule], controllers: [ProbeController] })
class ProbeAppModule {}

describe('Error contract e2e (TASK-003)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [ProbeAppModule] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('happy path: 200 responses carry a correlation id header', async () => {
    const res = await request(app.getHttpServer()).get('/probe/ok').expect(200);
    expect(res.body).toEqual({ ok: true });
    expect(res.headers[CORRELATION_HEADER]).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('echoes a well-formed client-supplied correlation id', async () => {
    const res = await request(app.getHttpServer())
      .get('/probe/ok')
      .set(CORRELATION_HEADER, 'client-ref-001')
      .expect(200);
    expect(res.headers[CORRELATION_HEADER]).toBe('client-ref-001');
  });

  it('replaces a malformed client-supplied correlation id', async () => {
    const res = await request(app.getHttpServer())
      .get('/probe/ok')
      .set(CORRELATION_HEADER, 'no!')
      .expect(200);
    expect(res.headers[CORRELATION_HEADER]).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('failure path: a typed DomainError maps to its status and the Error schema (AC-008)', async () => {
    const res = await request(app.getHttpServer())
      .get('/probe/missing')
      .set(CORRELATION_HEADER, 'client-ref-001')
      .expect(404);
    expect(res.body).toEqual({
      code: 'NOT_FOUND',
      message: 'Pond not found',
      details: { pondId: 'p-1' },
      correlationId: 'client-ref-001',
    });
  });

  it('ForbiddenError returns the uniform non-disclosing message (anti-enumeration)', async () => {
    const res = await request(app.getHttpServer()).get('/probe/forbidden').expect(403);
    expect(res.body.code).toBe('FORBIDDEN');
    expect(res.body.message).toBe('You do not have access to this resource.');
  });

  it('an unknown error becomes INTERNAL/500 with a correlation ref and no internals leaked', async () => {
    const res = await request(app.getHttpServer())
      .get('/probe/boom')
      .set(CORRELATION_HEADER, 'client-ref-001')
      .expect(500);
    expect(res.body).toEqual({
      code: 'INTERNAL',
      message: 'Something went wrong (ref: client-ref-001).',
      correlationId: 'client-ref-001',
    });
    expect(JSON.stringify(res.body)).not.toContain('secret internal detail');
  });

  it('an unknown route is shaped as the Error schema too', async () => {
    const res = await request(app.getHttpServer()).get('/no-such-route').expect(404);
    expect(res.body.code).toBe('NOT_FOUND');
    expect(res.body.correlationId).toBeDefined();
  });
});
