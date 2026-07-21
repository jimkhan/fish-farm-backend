import { calculateBiomassGainKg } from './biomass-gain.service';

describe('calculateBiomassGainKg (TASK-030, R3, edge case 2)', () => {
  it('gain = survivalEstimate × weight delta (kg) + harvested weight', () => {
    // 900 survivors × (150g - 50g) = 90,000g = 90kg, + 10kg harvested = 100kg
    const gain = calculateBiomassGainKg({
      survivalEstimate: 900,
      samplingsAscending: [{ avgWeightG: 50 }, { avgWeightG: 100 }, { avgWeightG: 150 }],
      harvestedWeightKg: 10,
    });
    expect(gain).toBe(100);
  });

  it('edge case 2: fewer than 2 samplings → null, never fabricated', () => {
    expect(
      calculateBiomassGainKg({ survivalEstimate: 900, samplingsAscending: [{ avgWeightG: 50 }], harvestedWeightKg: 0 }),
    ).toBeNull();
    expect(
      calculateBiomassGainKg({ survivalEstimate: 900, samplingsAscending: [], harvestedWeightKg: 0 }),
    ).toBeNull();
  });

  it('a zero-harvest batch with only current biomass gain still computes', () => {
    const gain = calculateBiomassGainKg({
      survivalEstimate: 500,
      samplingsAscending: [{ avgWeightG: 20 }, { avgWeightG: 40 }],
      harvestedWeightKg: 0,
    });
    expect(gain).toBe(10); // 500 × 20g / 1000
  });
});
