/**
 * R4/AC-099: survival rate = current survival ÷ initial count. Guarded against a zero initial
 * count (shouldn't occur — stocking requires count > 0 — but never divide by zero regardless).
 */
export function calculateSurvivalRate(survivalEstimate: number, initialCount: number): number {
  return initialCount === 0 ? 0 : survivalEstimate / initialCount;
}
