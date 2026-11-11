import { assessDensity } from './density';

describe('stocking-density advisory (FT-021, MOD-04 F4/R5, AC-065)', () => {
  it('perUnit is count ÷ area, in the project\'s own land unit', () => {
    expect(assessDensity(1000, 2, 'BIGHA', null, null)?.perUnit).toBe(500);
  });

  it('edge case 8: a zero, negative or missing area is not assessed — never a divide-by-zero', () => {
    expect(assessDensity(1000, 0, 'BIGHA', 100, 900)).toBeNull();
    expect(assessDensity(1000, -5, 'BIGHA', 100, 900)).toBeNull();
    expect(assessDensity(1000, undefined, 'BIGHA', 100, 900)).toBeNull();
    expect(assessDensity(undefined, 2, 'BIGHA', 100, 900)).toBeNull();
  });

  it('a species with no seeded range is recorded but NOT assessed — never a silent all-clear', () => {
    const assessment = assessDensity(1000, 2, 'BIGHA', null, null);
    expect(assessment?.verdict).toBe('NO_RANGE');
    expect(assessment?.min).toBeNull();
    expect(assessment?.max).toBeNull();
  });

  it('KATHA is not assessed — the specs document no katha/bigha conversion to use', () => {
    expect(assessDensity(1000, 2, 'KATHA', 100, 900)?.verdict).toBe('NO_RANGE');
  });

  describe('BIGHA — the range is already in the right unit', () => {
    it('within range', () => {
      const a = assessDensity(1000, 2, 'BIGHA', 100, 900);
      expect(a?.verdict).toBe('IN_RANGE');
      expect(a?.min).toBe(100);
      expect(a?.max).toBe(900);
    });

    it('under-stocked', () => {
      expect(assessDensity(100, 2, 'BIGHA', 100, 900)?.verdict).toBe('UNDER');
    });

    it('over-stocked reports how far above the ceiling', () => {
      const a = assessDensity(2000, 2, 'BIGHA', 100, 900);
      expect(a?.verdict).toBe('OVER');
      expect(a?.overBy).toBe(100); // 1000/bigha against a 900 ceiling
    });
  });

  describe('DECIMAL — the per-bigha range must be converted before it means anything', () => {
    /**
     * The bug this guards: comparing a per-decimal density straight against a per-bigha range
     * (and printing that range as "/decimal") advised roughly 33x over-stocking.
     */
    it('converts the range into per-decimal for both the verdict AND the displayed numbers', () => {
      const a = assessDensity(1000, 33, 'DECIMAL', 900, 1100);
      expect(a?.verdict).toBe('IN_RANGE'); // ~30.3/decimal == ~1000/bigha
      expect(a?.min).toBeCloseTo(900 / 33, 5); // ~27.3 /decimal, not 900
      expect(a?.max).toBeCloseTo(1100 / 33, 5);
    });

    it('a genuinely sparse pond still reads UNDER', () => {
      expect(assessDensity(500, 33, 'DECIMAL', 900, 1100)?.verdict).toBe('UNDER');
    });

    it('a genuinely crowded pond still reads OVER', () => {
      expect(assessDensity(2000, 33, 'DECIMAL', 900, 1100)?.verdict).toBe('OVER');
    });

    it('regression: a correctly-stocked decimal pond is NOT reported as under-stocked', () => {
      // Unconverted, perUnit (30.3) < min (900) would have said UNDER — advising the farmer to
      // stock ~33x more fish into an already correctly-stocked pond.
      expect(assessDensity(1000, 33, 'DECIMAL', 900, 1100)?.verdict).not.toBe('UNDER');
    });
  });

  it('handles a one-sided range (only a maximum seeded)', () => {
    expect(assessDensity(2000, 2, 'BIGHA', null, 900)?.verdict).toBe('OVER');
    expect(assessDensity(100, 2, 'BIGHA', null, 900)?.verdict).toBe('IN_RANGE');
  });
});
