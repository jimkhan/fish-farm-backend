/**
 * R3/AC-098: FCR = total feed input ÷ biomass gain, computed at pond level only (RISK-007 —
 * never per-species; a pond's feed accumulator already sums across every batch in the pond).
 * Returns `null` — never `Infinity`/`NaN` — when gain is unmeasurable or non-positive, the same
 * "never fabricate" zero/undefined-guard pattern used throughout this codebase (e.g. TASK-033's
 * ROI zero-cost guard).
 */
export function calculateFcr(totalFeedKg: number, biomassGainKg: number | null): number | null {
  if (biomassGainKg === null || biomassGainKg <= 0) {
    return null;
  }
  return totalFeedKg / biomassGainKg;
}
