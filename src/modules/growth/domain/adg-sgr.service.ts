export interface WeightPoint {
  readonly avgWeightG: number;
  readonly sampledOn: Date;
}

export interface GrowthMetrics {
  readonly adgGPerDay: number;
  readonly sgrPercentPerDay: number;
}

/**
 * F5/R5 (AC-097): ADG = (W₂ − W₁) / days; SGR = (ln W₂ − ln W₁) / days × 100 — computed from the
 * two most recent **consecutive** samplings (R2 already guarantees `avgWeightG > 0` at write
 * time, so `Math.log` never sees a non-positive input here). Edge case 5: a lower later weight is
 * not hidden — `adgGPerDay`/`sgrPercentPerDay` can be negative, a genuine growth anomaly, not an
 * error.
 */
export class AdgSgrCalculator {
  compute(earlier: WeightPoint, later: WeightPoint): GrowthMetrics | null {
    const days = (later.sampledOn.getTime() - earlier.sampledOn.getTime()) / 86_400_000;
    if (days <= 0) {
      return null;
    }
    return {
      adgGPerDay: (later.avgWeightG - earlier.avgWeightG) / days,
      sgrPercentPerDay: ((Math.log(later.avgWeightG) - Math.log(earlier.avgWeightG)) / days) * 100,
    };
  }
}
