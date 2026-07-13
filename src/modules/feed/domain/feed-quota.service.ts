import { BwBand, DEFAULT_BW_BANDS, resolveBwBand } from './bw-band.vo';

export interface FeedQuotaInput {
  readonly survivalEstimate: number;
  readonly latestAvgWeightG: number | null;
  readonly bwBands?: readonly BwBand[];
}

export type FeedQuotaResult =
  | { readonly status: 'OK'; readonly totalKg: number; readonly bwPercent: number }
  | { readonly status: 'SAMPLING_REQUIRED' };

/**
 * F1 (TASK-021, AC-071/072, R1/R2). Pure — biomass and the BW% band are both inputs, nothing here
 * is hardcoded per-species/stage logic (R1). `latestAvgWeightG === null` means the batch has never
 * been sampled (`Batch`'s own R6) — the quota is never fabricated (R2); `SAMPLING_REQUIRED` is
 * returned instead of a number.
 */
export class FeedQuotaCalculator {
  calculate(input: FeedQuotaInput): FeedQuotaResult {
    if (input.latestAvgWeightG === null) {
      return { status: 'SAMPLING_REQUIRED' };
    }

    const band = resolveBwBand(input.latestAvgWeightG, input.bwBands ?? DEFAULT_BW_BANDS);
    const biomassKg = (input.survivalEstimate * input.latestAvgWeightG) / 1000;
    const totalKg = biomassKg * (band.bwPercent / 100);

    return { status: 'OK', totalKg, bwPercent: band.bwPercent };
  }
}
