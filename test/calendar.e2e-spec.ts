import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { CalendarModule } from '../src/platform/calendar/calendar.module';
import { ErrorsModule } from '../src/shared-kernel/errors/errors.module';

/**
 * `GET /calendar/convert` e2e (TASK-007, CON-041). No database needed — the calendar package
 * is pure — so this boots a minimal app with just the calendar + error-contract modules.
 */
describe('GET /calendar/convert (TASK-007, CON-041)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ErrorsModule, CalendarModule],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns the BanglaDate schema for the Pohela Boishakh anchor', async () => {
    const res = await request(app.getHttpServer())
      .get('/calendar/convert')
      .query({ date: '2026-04-14' })
      .expect(200);

    expect(res.body).toEqual({
      gregorian: '2026-04-14',
      banglaYear: 1433,
      banglaMonth: 'BOISHAKH',
      banglaDay: 1,
      ritu: 'GRISHMO',
      formattedBn: '১ Boishakh, ১৪৩৩',
    });
  });

  it('returns the Victory Day anchor (16 Dec → 1 Poush)', async () => {
    const res = await request(app.getHttpServer())
      .get('/calendar/convert')
      .query({ date: '2026-12-16' })
      .expect(200);

    expect(res.body).toMatchObject({ banglaMonth: 'POUSH', banglaDay: 1, ritu: 'SHEET' });
  });

  it('400s on a missing date with the shared Error schema', async () => {
    const res = await request(app.getHttpServer()).get('/calendar/convert').expect(400);
    expect(res.body).toMatchObject({ code: 'VALIDATION' });
    expect(res.body.correlationId).toBeDefined();
  });

  it('400s on a malformed date', async () => {
    await request(app.getHttpServer())
      .get('/calendar/convert')
      .query({ date: 'not-a-date' })
      .expect(400);
  });
});
