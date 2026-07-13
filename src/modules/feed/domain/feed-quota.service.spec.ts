import { FeedQuotaCalculator } from './feed-quota.service';
import { DEFAULT_BW_BANDS, resolveBwBand } from './bw-band.vo';

describe('FeedQuotaCalculator (TASK-021, F1, AC-071/072, R1/R2)', () => {
  const calculator = new FeedQuotaCalculator();

  it('AC-072/R2: returns SAMPLING_REQUIRED when the batch has never been sampled, never fabricating a quota', () => {
    const result = calculator.calculate({ survivalEstimate: 1000, latestAvgWeightG: null });
    expect(result).toEqual({ status: 'SAMPLING_REQUIRED' });
  });

  it('AC-071: quota = biomass (survival × latest avg weight) × the BW% band for that weight', () => {
    // 1000 survivors × 50g = 50,000g = 50kg biomass; 50g falls in the 20–100g band (5%).
    const result = calculator.calculate({ survivalEstimate: 1000, latestAvgWeightG: 50 });
    expect(result).toEqual({ status: 'OK', totalKg: 2.5, bwPercent: 5 });
  });

  it('R1: the BW% band is a parameter, not hardcoded — a custom table changes the result', () => {
    const customBands = [{ minWeightG: null, maxWeightG: null, bwPercent: 1 }];
    const result = calculator.calculate({
      survivalEstimate: 1000,
      latestAvgWeightG: 50,
      bwBands: customBands,
    });
    expect(result).toEqual({ status: 'OK', totalKg: 0.5, bwPercent: 1 });
  });

  it('a zero survival estimate produces a zero quota, not an error', () => {
    const result = calculator.calculate({ survivalEstimate: 0, latestAvgWeightG: 50 });
    expect(result).toEqual({ status: 'OK', totalKg: 0, bwPercent: 5 });
  });
});

describe('resolveBwBand (bands contiguous, unbounded at both ends)', () => {
  it('resolves the fry band below the first boundary', () => {
    expect(resolveBwBand(1)).toEqual(DEFAULT_BW_BANDS[0]);
  });

  it('resolves the grow-out band above the last boundary', () => {
    expect(resolveBwBand(10_000)).toEqual(DEFAULT_BW_BANDS[DEFAULT_BW_BANDS.length - 1]);
  });

  it('a boundary weight resolves to the band it is the minimum of (min inclusive, max exclusive)', () => {
    expect(resolveBwBand(20)).toEqual(DEFAULT_BW_BANDS[2]);
    expect(resolveBwBand(19.999)).toEqual(DEFAULT_BW_BANDS[1]);
  });
});
