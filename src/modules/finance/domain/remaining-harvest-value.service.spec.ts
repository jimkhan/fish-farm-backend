import { assumedGradeForCategory, calculateRemainingHarvestValueMinor } from './remaining-harvest-value.service';

describe('assumedGradeForCategory (TASK-033, R5)', () => {
  it('PRAWN assumes EXPORT', () => {
    expect(assumedGradeForCategory('PRAWN')).toBe('EXPORT');
  });

  it('FISH assumes LOCAL', () => {
    expect(assumedGradeForCategory('FISH')).toBe('LOCAL');
  });
});

describe('calculateRemainingHarvestValueMinor (TASK-033, F2/R5, AC-110)', () => {
  it('sums biomass × market rate by assumed grade across species', () => {
    const result = calculateRemainingHarvestValueMinor([
      { speciesCategory: 'PRAWN', biomassKg: 10 }, // 10 × 80,000 = 800,000
      { speciesCategory: 'FISH', biomassKg: 20 }, // 20 × 25,000 = 500,000
    ]);
    expect(result).toBe(1_300_000);
  });

  it('zero biomass contributes zero value, never negative', () => {
    expect(calculateRemainingHarvestValueMinor([{ speciesCategory: 'FISH', biomassKg: 0 }])).toBe(0);
  });

  it('an empty species list yields zero', () => {
    expect(calculateRemainingHarvestValueMinor([])).toBe(0);
  });
});
