import { DoReadingDatum, PatternDetector } from './pattern-detector';

// Bangladesh is UTC+6, dawn window is local 04:00–09:00 → UTC 22:00–03:00. `dawn(day, hourLocal)`
// builds a UTC Date whose Dhaka-local wall clock is `hourLocal` on the given 2026-06 day.
function dawn(dayOfMonth: number, hourLocal = 6): Date {
  // localHour = utcHour + 6, so utcHour = hourLocal - 6 (may cross midnight → handled by Date).
  return new Date(Date.UTC(2026, 5, dayOfMonth, hourLocal - 6, 0, 0));
}

function midday(dayOfMonth: number): Date {
  // 13:00 local = 07:00 UTC — outside the dawn window.
  return new Date(Date.UTC(2026, 5, dayOfMonth, 7, 0, 0));
}

function reading(value: number, readAt: Date): DoReadingDatum {
  return { value, readAt };
}

describe('PatternDetector — falling dawn DO (AC-087, R5)', () => {
  const detector = new PatternDetector(); // defaults: 3 consecutive days, dawn 04:00–09:00 local

  it('surfaces an advisory when dawn DO strictly declines over 3 consecutive days', () => {
    const advisory = detector.detectFallingDawnDo([
      reading(6.0, dawn(1)),
      reading(5.2, dawn(2)),
      reading(4.5, dawn(3)),
    ]);

    expect(advisory).not.toBeNull();
    expect(advisory).toMatchObject({ pattern: 'FALLING_DAWN_DO', consecutiveDays: 3 });
    expect(advisory!.fromReadAt).toEqual(dawn(1));
    expect(advisory!.toReadAt).toEqual(dawn(3));
    expect(advisory!.dropValue).toBeCloseTo(1.5);
  });

  it('does NOT surface an advisory for a flat or rising series', () => {
    expect(
      detector.detectFallingDawnDo([reading(5, dawn(1)), reading(5, dawn(2)), reading(5, dawn(3))]),
    ).toBeNull();
    expect(
      detector.detectFallingDawnDo([
        reading(4.5, dawn(1)),
        reading(5.2, dawn(2)),
        reading(6.0, dawn(3)),
      ]),
    ).toBeNull();
  });

  it('requires the decline to be current — a decline that already reversed does not fire', () => {
    // Days 1-3 fall, day 4 recovers: the run ending at the most recent day is only length 1.
    expect(
      detector.detectFallingDawnDo([
        reading(6.0, dawn(1)),
        reading(5.0, dawn(2)),
        reading(4.0, dawn(3)),
        reading(5.5, dawn(4)),
      ]),
    ).toBeNull();
  });

  it('reports the full run length when more than the minimum consecutive days decline', () => {
    const advisory = detector.detectFallingDawnDo([
      reading(7, dawn(1)),
      reading(6, dawn(2)),
      reading(5, dawn(3)),
      reading(4, dawn(4)),
    ]);
    expect(advisory!.consecutiveDays).toBe(4);
    expect(advisory!.dropValue).toBeCloseTo(3);
  });

  it('ignores non-dawn readings even when they would form a decline', () => {
    // Midday readings decline, but none are in the dawn window → nothing to detect.
    expect(
      detector.detectFallingDawnDo([
        reading(6, midday(1)),
        reading(5, midday(2)),
        reading(4, midday(3)),
      ]),
    ).toBeNull();
  });

  it('collapses multiple dawn readings on one day to the earliest, needing distinct days', () => {
    // Two readings on day 1, one on day 2 → only 2 distinct dawn days, below the 3-day threshold.
    expect(
      detector.detectFallingDawnDo([
        reading(6, dawn(1, 5)),
        reading(5.5, dawn(1, 8)),
        reading(5, dawn(2)),
      ]),
    ).toBeNull();
  });

  it('returns null for fewer than the required consecutive days', () => {
    expect(
      detector.detectFallingDawnDo([reading(6, dawn(1)), reading(5, dawn(2))]),
    ).toBeNull();
  });
});
