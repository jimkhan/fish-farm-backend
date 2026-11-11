/**
 * AC-099 (amended): survival rate = fish that did not die ÷ initial count. Guarded against a zero
 * initial count (shouldn't occur — stocking requires count > 0 — but never divide by zero).
 *
 * The input is `Batch.survivorsExcludingHarvest`, **not** `Batch.survivalEstimate`. The latter
 * also subtracts harvested fish, which is correct for remaining stock and wrong for survival: a
 * harvested fish survived. Feeding it in made a healthy, 60%-harvested batch report a 40%
 * survival rate — visually identical to a mass die-off, on a headline husbandry KPI.
 */
export function calculateSurvivalRate(survivorsExcludingHarvest: number, initialCount: number): number {
  return initialCount === 0 ? 0 : survivorsExcludingHarvest / initialCount;
}
