import { DEFAULT_WATER_THRESHOLDS } from '../../water/domain/default-thresholds';
import { reduceWaterStatus } from './water-status.service';

describe('reduceWaterStatus (TASK-037, R5, AC-122/125)', () => {
  it('AC-125: no readings at all → OK, not fabricated as worse', () => {
    expect(reduceWaterStatus([], DEFAULT_WATER_THRESHOLDS)).toBe('OK');
  });

  it('every reading within range → OK', () => {
    const readings = [
      { parameter: 'DO' as const, value: 5 },
      { parameter: 'PH' as const, value: 7.5 },
    ];
    expect(reduceWaterStatus(readings, DEFAULT_WATER_THRESHOLDS)).toBe('OK');
  });

  it('one WARNING reading among OK ones → WARNING (worst wins)', () => {
    const readings = [
      { parameter: 'DO' as const, value: 5 },
      { parameter: 'DO' as const, value: 3.5 }, // below min=4, above critical=3 → WARNING
    ];
    expect(reduceWaterStatus(readings, DEFAULT_WATER_THRESHOLDS)).toBe('WARNING');
  });

  it('one CRITICAL reading among OK/WARNING ones → CRITICAL (worst wins)', () => {
    const readings = [
      { parameter: 'DO' as const, value: 3.5 }, // WARNING
      { parameter: 'DO' as const, value: 2.5 }, // below critical=3 → CRITICAL
    ];
    expect(reduceWaterStatus(readings, DEFAULT_WATER_THRESHOLDS)).toBe('CRITICAL');
  });

  it('uses a configured override instead of the seeded default when provided', () => {
    const strictDo = { ...DEFAULT_WATER_THRESHOLDS, DO: { min: 6, max: null, critical: 5 } };
    const readings = [{ parameter: 'DO' as const, value: 5.5 }]; // within seeded default, breaches override
    expect(reduceWaterStatus(readings, strictDo)).toBe('WARNING');
  });
});
