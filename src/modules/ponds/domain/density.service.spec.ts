import { computeDensity, computeDensityAdvisory } from './density.service';

describe('density.service (TASK-019, MOD-04 F4/R5, AC-065)', () => {
  it('computeDensity() is count ÷ area', () => {
    expect(computeDensity(1000, 2)).toBe(500);
  });

  it('returns no advisory (null) when the species has no seeded range yet', () => {
    const advisory = computeDensityAdvisory(1000, 2, 'BIGHA', null, null);
    expect(advisory.belowMin).toBeNull();
    expect(advisory.aboveMax).toBeNull();
  });

  it('returns no advisory for KATHA — no conversion factor exists in the specs', () => {
    const advisory = computeDensityAdvisory(1000, 2, 'KATHA', 100, 900);
    expect(advisory.belowMin).toBeNull();
    expect(advisory.aboveMax).toBeNull();
  });

  it('BIGHA needs no conversion — density compares directly against the bigha range', () => {
    const withinRange = computeDensityAdvisory(1000, 2, 'BIGHA', 100, 900);
    expect(withinRange.belowMin).toBe(false);
    expect(withinRange.aboveMax).toBe(false);

    const tooSparse = computeDensityAdvisory(100, 2, 'BIGHA', 100, 900);
    expect(tooSparse.belowMin).toBe(true);

    const tooDense = computeDensityAdvisory(2000, 2, 'BIGHA', 100, 900);
    expect(tooDense.aboveMax).toBe(true);
  });

  it('DECIMAL converts via the ~33 decimal/bigha approximation before comparing', () => {
    // A pond of "33 decimal" is ~1 bigha, so its whole-pond count converts almost directly to a
    // per-bigha figure: 1000 count / 33 decimal ≈ 30.3/decimal, which is ~1000/bigha (×33).
    const advisory = computeDensityAdvisory(1000, 33, 'DECIMAL', 900, 1100);
    expect(advisory.belowMin).toBe(false);
    expect(advisory.aboveMax).toBe(false);

    // Halve the count (same area) → ~500/bigha, clearly below a [900, 1100] range.
    const sparse = computeDensityAdvisory(500, 33, 'DECIMAL', 900, 1100);
    expect(sparse.belowMin).toBe(true);
  });
});
