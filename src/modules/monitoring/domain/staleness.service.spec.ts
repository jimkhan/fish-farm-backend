import { isStale, WEATHER_STALENESS_THRESHOLD_MS } from './staleness.service';

describe('isStale (TASK-036, R3, AC-121)', () => {
  const now = new Date('2026-01-01T12:00:00Z');

  it('is fresh just under the threshold', () => {
    const fetchedAt = new Date(now.getTime() - (WEATHER_STALENESS_THRESHOLD_MS - 1000));
    expect(isStale(fetchedAt, now)).toBe(false);
  });

  it('is stale just over the threshold', () => {
    const fetchedAt = new Date(now.getTime() - (WEATHER_STALENESS_THRESHOLD_MS + 1000));
    expect(isStale(fetchedAt, now)).toBe(true);
  });

  it('a just-fetched reading is never stale', () => {
    expect(isStale(now, now)).toBe(false);
  });
});
