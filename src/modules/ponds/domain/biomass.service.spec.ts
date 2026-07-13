import { aggregateBiomassBySpecies, totalBiomassKg } from './biomass.service';

describe('biomass.service (TASK-019, MOD-04 F5/R6, AC-066, CON-043)', () => {
  it('AC-066: biomassKg = survivalEstimate × latestAvgWeightG, converted to kg', () => {
    const [golda] = aggregateBiomassBySpecies([
      { speciesId: 'golda', survivalEstimate: 1000, initialCount: 1000, latestAvgWeightG: 25 },
    ]);
    expect(golda.biomassKg).toBe((1000 * 25) / 1000);
  });

  it('R6: a batch with no sampling yet contributes 0, not null, to the aggregate', () => {
    const [golda] = aggregateBiomassBySpecies([
      { speciesId: 'golda', survivalEstimate: 500, initialCount: 500, latestAvgWeightG: null },
    ]);
    expect(golda.biomassKg).toBe(0);
  });

  it('aggregates multiple batches of the same species together', () => {
    const [golda] = aggregateBiomassBySpecies([
      { speciesId: 'golda', survivalEstimate: 500, initialCount: 500, latestAvgWeightG: 20 },
      { speciesId: 'golda', survivalEstimate: 300, initialCount: 500, latestAvgWeightG: 30 },
    ]);
    expect(golda.biomassKg).toBe((500 * 20 + 300 * 30) / 1000);
    expect(golda.survivalRate).toBe(800 / 1000);
  });

  it('keeps different species separate', () => {
    const result = aggregateBiomassBySpecies([
      { speciesId: 'golda', survivalEstimate: 500, initialCount: 500, latestAvgWeightG: 20 },
      { speciesId: 'parse', survivalEstimate: 200, initialCount: 250, latestAvgWeightG: 15 },
    ]);
    expect(result).toHaveLength(2);
    expect(result.find((s) => s.speciesId === 'parse')?.survivalRate).toBe(200 / 250);
  });

  it('totalBiomassKg sums every species', () => {
    const perSpecies = aggregateBiomassBySpecies([
      { speciesId: 'golda', survivalEstimate: 500, initialCount: 500, latestAvgWeightG: 20 },
      { speciesId: 'parse', survivalEstimate: 200, initialCount: 250, latestAvgWeightG: 15 },
    ]);
    expect(totalBiomassKg(perSpecies)).toBe((500 * 20) / 1000 + (200 * 15) / 1000);
  });

  it('an empty batch list yields an empty overview with zero total', () => {
    expect(aggregateBiomassBySpecies([])).toEqual([]);
    expect(totalBiomassKg([])).toBe(0);
  });
});
