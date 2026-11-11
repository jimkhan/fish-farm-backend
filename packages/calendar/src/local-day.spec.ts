import { toBangla } from './conversion';
import {
  BANGLADESH_UTC_OFFSET_MINUTES,
  bangladeshLocalDayIso,
  toBangladeshLocalDay,
} from './local-day';

describe('Bangladesh local calendar day (FR-058)', () => {
  it('is UTC+6 with no DST', () => {
    expect(BANGLADESH_UTC_OFFSET_MINUTES).toBe(360);
  });

  it('an instant already past local midnight resolves to the NEW day, not the UTC one', () => {
    // 02:00 on 18 Aug in Dhaka is still 17 Aug 20:00 UTC — the case that showed owners yesterday.
    const instant = new Date('2026-08-17T20:00:00Z');
    expect(bangladeshLocalDayIso(instant)).toBe('2026-08-18');
  });

  it('the moment before local midnight still resolves to the old day', () => {
    const instant = new Date('2026-08-17T17:59:59Z'); // 23:59:59 local on the 17th
    expect(bangladeshLocalDayIso(instant)).toBe('2026-08-17');
  });

  it('local midnight exactly rolls the day over', () => {
    expect(bangladeshLocalDayIso(new Date('2026-08-17T18:00:00Z'))).toBe('2026-08-18');
  });

  it('midday UTC is unaffected — the same day either way', () => {
    expect(bangladeshLocalDayIso(new Date('2026-08-17T12:00:00Z'))).toBe('2026-08-17');
  });

  it('is idempotent for a date-only value (a `date` column deserialises to UTC midnight)', () => {
    const dateOnly = new Date('2026-08-17');
    expect(bangladeshLocalDayIso(dateOnly)).toBe('2026-08-17');
    expect(bangladeshLocalDayIso(toBangladeshLocalDay(dateOnly))).toBe('2026-08-17');
  });

  it('returns UTC midnight, the shape toBangla expects', () => {
    const day = toBangladeshLocalDay(new Date('2026-08-17T20:30:45.123Z'));
    expect(day.toISOString()).toBe('2026-08-18T00:00:00.000Z');
  });

  it('carries the Bangla date across with it — Pohela Boishakh at 01:00 local is 1 Boishakh', () => {
    // 2026-04-14 01:00 Dhaka = 2026-04-13 19:00 UTC. Raw UTC would give 30 Choitro, the day before.
    const instant = new Date('2026-04-13T19:00:00Z');
    expect(toBangla(instant)).toMatchObject({ month: 12, day: 30 }); // the bug
    expect(toBangla(toBangladeshLocalDay(instant))).toMatchObject({
      month: 1,
      day: 1,
      year: 1433,
    });
  });
});
