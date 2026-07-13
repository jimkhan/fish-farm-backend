import { AdgSgrCalculator } from './adg-sgr.service';

describe('AdgSgrCalculator (TASK-029, F5/R5, AC-097)', () => {
  const calculator = new AdgSgrCalculator();

  it('computes ADG/SGR across 10 days of positive growth', () => {
    const earlier = { avgWeightG: 10, sampledOn: new Date('2026-01-01') };
    const later = { avgWeightG: 20, sampledOn: new Date('2026-01-11') };

    const result = calculator.compute(earlier, later);
    expect(result).not.toBeNull();
    expect(result!.adgGPerDay).toBeCloseTo((20 - 10) / 10, 5);
    expect(result!.sgrPercentPerDay).toBeCloseTo(((Math.log(20) - Math.log(10)) / 10) * 100, 5);
  });

  it('edge case 5: a lower later weight yields a negative ADG/SGR, not hidden or thrown', () => {
    const earlier = { avgWeightG: 20, sampledOn: new Date('2026-01-01') };
    const later = { avgWeightG: 15, sampledOn: new Date('2026-01-06') };

    const result = calculator.compute(earlier, later);
    expect(result).not.toBeNull();
    expect(result!.adgGPerDay).toBeLessThan(0);
    expect(result!.sgrPercentPerDay).toBeLessThan(0);
  });

  it('returns null when the samplings are not chronologically ordered (non-positive days)', () => {
    const earlier = { avgWeightG: 10, sampledOn: new Date('2026-01-10') };
    const later = { avgWeightG: 20, sampledOn: new Date('2026-01-01') };
    expect(calculator.compute(earlier, later)).toBeNull();
  });

  it('returns null for same-day samplings (zero days)', () => {
    const day = new Date('2026-01-01');
    expect(calculator.compute({ avgWeightG: 10, sampledOn: day }, { avgWeightG: 12, sampledOn: day })).toBeNull();
  });
});
