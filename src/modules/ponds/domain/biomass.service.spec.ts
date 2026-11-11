import { aggregateBiomassBySpecies, BiomassBatchInput, totalBiomassKg } from './biomass.service';

/** Most cases have no harvest, where stock and survivors coincide. */
function batch(overrides: Partial<BiomassBatchInput> & { speciesId: string }): BiomassBatchInput {
  const survivalEstimate = overrides.survivalEstimate ?? 0;
  return {
    survivalEstimate,
    survivorsExcludingHarvest: overrides.survivorsExcludingHarvest ?? survivalEstimate,
    initialCount: overrides.initialCount ?? survivalEstimate,
    latestAvgWeightG: overrides.latestAvgWeightG ?? null,
    ...overrides,
  };
}

describe('biomass.service (TASK-019, MOD-04 F5/R6, AC-066, CON-043)', () => {
  it('AC-066: biomassKg = survivalEstimate × latestAvgWeightG, converted to kg', () => {
    const [golda] = aggregateBiomassBySpecies([
      batch({ speciesId: 'golda', survivalEstimate: 1000, initialCount: 1000, latestAvgWeightG: 25 }),
    ]);
    expect(golda.biomassKg).toBe((1000 * 25) / 1000);
  });

  it('R6: a batch with no sampling yet contributes 0, not null, to the aggregate', () => {
    const [golda] = aggregateBiomassBySpecies([
      batch({ speciesId: 'golda', survivalEstimate: 500, initialCount: 500, latestAvgWeightG: null }),
    ]);
    expect(golda.biomassKg).toBe(0);
  });

  it('aggregates multiple batches of the same species together', () => {
    const [golda] = aggregateBiomassBySpecies([
      batch({ speciesId: 'golda', survivalEstimate: 500, initialCount: 500, latestAvgWeightG: 20 }),
      batch({ speciesId: 'golda', survivalEstimate: 300, initialCount: 500, latestAvgWeightG: 30 }),
    ]);
    expect(golda.biomassKg).toBe((500 * 20 + 300 * 30) / 1000);
    expect(golda.survivalRate).toBe(800 / 1000);
  });

  it('keeps different species separate', () => {
    const result = aggregateBiomassBySpecies([
      batch({ speciesId: 'golda', survivalEstimate: 500, initialCount: 500, latestAvgWeightG: 20 }),
      batch({ speciesId: 'parse', survivalEstimate: 200, initialCount: 250, latestAvgWeightG: 15 }),
    ]);
    expect(result).toHaveLength(2);
    expect(result.find((s) => s.speciesId === 'parse')?.survivalRate).toBe(200 / 250);
  });

  it('totalBiomassKg sums every species', () => {
    const perSpecies = aggregateBiomassBySpecies([
      batch({ speciesId: 'golda', survivalEstimate: 500, initialCount: 500, latestAvgWeightG: 20 }),
      batch({ speciesId: 'parse', survivalEstimate: 200, initialCount: 250, latestAvgWeightG: 15 }),
    ]);
    expect(totalBiomassKg(perSpecies)).toBe((500 * 20) / 1000 + (200 * 15) / 1000);
  });

  it('an empty batch list yields an empty overview with zero total', () => {
    expect(aggregateBiomassBySpecies([])).toEqual([]);
    expect(totalBiomassKg([])).toBe(0);
  });

  /**
   * AC-099 (amended): a harvested fish survived — it was sold, not lost. Biomass must drop when
   * stock leaves the pond; survival rate must not.
   */
  it('a harvest reduces biomass but NOT survival rate', () => {
    const [golda] = aggregateBiomassBySpecies([
      batch({
        speciesId: 'golda',
        initialCount: 1000,
        survivalEstimate: 400, // 1000 stocked − 0 dead − 600 harvested
        survivorsExcludingHarvest: 1000, // nothing died
        latestAvgWeightG: 25,
      }),
    ]);

    expect(golda.biomassKg).toBe((400 * 25) / 1000); // only the fish still in the pond
    expect(golda.survivalRate).toBe(1); // a flawless batch, not "40% survival"
  });

  it('mortality does reduce survival rate', () => {
    const [golda] = aggregateBiomassBySpecies([
      batch({
        speciesId: 'golda',
        initialCount: 1000,
        survivalEstimate: 300, // 200 died, 500 harvested
        survivorsExcludingHarvest: 800,
        latestAvgWeightG: 25,
      }),
    ]);

    expect(golda.survivalRate).toBe(0.8);
  });
});
