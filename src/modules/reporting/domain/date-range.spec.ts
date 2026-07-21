import { utcDayRange } from './date-range';

describe('utcDayRange (TASK-037)', () => {
  it('returns the UTC midnight-to-midnight range for a given date', () => {
    const { fromInclusive, toExclusive } = utcDayRange(new Date('2026-06-15T14:32:00Z'));
    expect(fromInclusive.toISOString()).toBe('2026-06-15T00:00:00.000Z');
    expect(toExclusive.toISOString()).toBe('2026-06-16T00:00:00.000Z');
  });
});
