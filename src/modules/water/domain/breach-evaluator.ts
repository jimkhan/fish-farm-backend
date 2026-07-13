export type BreachSeverity = 'WARNING' | 'CRITICAL';

export interface ThresholdBounds {
  readonly min: number | null;
  readonly max: number | null;
  readonly critical: number | null;
}

/**
 * F2/R2/R3 (AC-084/085/092): pure breach evaluation across every threshold shape — min-only
 * (DO, alkalinity), max-only (ammonia, nitrite), and range (pH, temp, Secchi). A single
 * `critical` bound (not a separate `criticalMin`/`criticalMax` — the schema carries only one) is
 * checked on whichever side the value actually breached: below `min` escalates to CRITICAL when
 * additionally below `critical`; above `max` escalates when additionally above `critical`. This
 * generalizes the module doc's only concrete example (DO: min≈4, critical<3) to every shape
 * without hardcoding per-parameter direction.
 */
export class BreachEvaluator {
  evaluate(value: number, bounds: ThresholdBounds): BreachSeverity | null {
    const { min, max, critical } = bounds;

    if (min !== null && value < min) {
      return critical !== null && value < critical ? 'CRITICAL' : 'WARNING';
    }
    if (max !== null && value > max) {
      return critical !== null && value > critical ? 'CRITICAL' : 'WARNING';
    }
    return null;
  }
}
