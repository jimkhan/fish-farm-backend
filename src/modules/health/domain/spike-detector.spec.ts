import { SpikeDetector } from './spike-detector';

const today = new Date('2026-01-08T12:00:00Z');

function daysBefore(n: number, hour = 12): Date {
  return new Date(`2026-01-${String(8 - n).padStart(2, '0')}T${String(hour).padStart(2, '0')}:00:00Z`);
}

describe('SpikeDetector (TASK-028, F3/R6, AC-100)', () => {
  it('flags when today exceeds multiplier × the trailing 7-day average', () => {
    const detector = new SpikeDetector(3, 7);
    // 7 prior days averaging 2/day (baseline 2); today = 10 > 2*3 = 6 → spike.
    const trailing = Array.from({ length: 7 }, (_, i) => ({ count: 2, occurredAt: daysBefore(i + 1) }));
    const records = [...trailing, { count: 10, occurredAt: today }];
    expect(detector.isSpike(records, today)).toBe(true);
  });

  it('does not flag when today is within multiplier × the baseline', () => {
    const detector = new SpikeDetector(3, 7);
    const trailing = Array.from({ length: 7 }, (_, i) => ({ count: 2, occurredAt: daysBefore(i + 1) }));
    const records = [...trailing, { count: 5, occurredAt: today }]; // 5 <= 2*3
    expect(detector.isSpike(records, today)).toBe(false);
  });

  it('never flags a batch with no trailing history (baseline 0) — avoids day-one false positives', () => {
    const detector = new SpikeDetector(3, 7);
    const records = [{ count: 50, occurredAt: today }];
    expect(detector.isSpike(records, today)).toBe(false);
  });

  it('never flags an all-zero trailing baseline even with a large single-day count', () => {
    const detector = new SpikeDetector(3, 7);
    const trailing = Array.from({ length: 7 }, (_, i) => ({ count: 0, occurredAt: daysBefore(i + 1) }));
    const records = [...trailing, { count: 100, occurredAt: today }];
    expect(detector.isSpike(records, today)).toBe(false);
  });

  it('sums multiple same-day entries toward "today" total', () => {
    const detector = new SpikeDetector(3, 7);
    const trailing = Array.from({ length: 7 }, (_, i) => ({ count: 1, occurredAt: daysBefore(i + 1) }));
    // baseline = 1/day; two entries today sum to 4 > 1*3 = 3 → spike.
    const records = [
      ...trailing,
      { count: 2, occurredAt: daysBefore(0, 6) },
      { count: 2, occurredAt: daysBefore(0, 18) },
    ];
    expect(detector.isSpike(records, today)).toBe(true);
  });

  it('ignores records outside the trailing window (older than windowDays)', () => {
    const detector = new SpikeDetector(3, 7);
    // A large count 10 days ago falls outside the 7-day window and must not raise the baseline.
    const records = [
      { count: 100, occurredAt: new Date('2025-12-29T12:00:00Z') },
      { count: 2, occurredAt: daysBefore(1) },
      { count: 6, occurredAt: today },
    ];
    // baseline only reflects the 1 in-window trailing record: 2/7 ≈ 0.29 → baseline>0 but 6 > 0.29*3.
    expect(detector.isSpike(records, today)).toBe(true);
  });
});
