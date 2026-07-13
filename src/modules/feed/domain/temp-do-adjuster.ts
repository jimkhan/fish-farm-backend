import { ThresholdBounds } from '../../water/domain/breach-evaluator';

export interface TempDoAdjusterInput {
  readonly baseKg: number;
  readonly latestDo: number | null;
  readonly latestTemp: number | null;
  readonly doBounds: ThresholdBounds;
  readonly tempBounds: ThresholdBounds;
}

export interface TempDoAdjusterResult {
  readonly adjustedKg: number;
  readonly adjusted: boolean;
  readonly reason: string | null;
}

/**
 * F2 (TASK-021, AC-073, R3, edge case 2). DO below `doBounds.critical` skips feeding outright
 * (quota 0 — edge case 2's "plan recommends skip... with the DO reason"); DO below `doBounds.min`
 * (but not yet critical) or temperature outside `[tempBounds.min, tempBounds.max]` reduces by
 * `REDUCTION_FACTOR` instead. Skip wins over reduce when both would apply — it's the more severe
 * response. A missing reading (`null`, e.g. never recorded for this pond) never triggers an
 * adjustment: the module doc's "stale DO → conservative reduction, never silently guess" (§6.3) is
 * about *stale* data, which this task has no way to distinguish from fresh without a staleness
 * window nowhere specified — *absent* data has no direction to guess in, so it is left unadjusted
 * rather than assumed bad. `REDUCTION_FACTOR` is a documented default — the module doc names no
 * exact number (the same kind of tunable judgment call as TASK-017's retry/backoff constants).
 */
export class TempDoAdjuster {
  private static readonly REDUCTION_FACTOR = 0.5;

  adjust(input: TempDoAdjusterInput): TempDoAdjusterResult {
    const { baseKg, latestDo, latestTemp, doBounds, tempBounds } = input;

    if (latestDo !== null && doBounds.critical !== null && latestDo < doBounds.critical) {
      return {
        adjustedKg: 0,
        adjusted: true,
        reason: 'Dissolved oxygen is critically low — feeding skipped.',
      };
    }

    const doLow = latestDo !== null && doBounds.min !== null && latestDo < doBounds.min;
    const tempOutOfBand =
      latestTemp !== null &&
      ((tempBounds.min !== null && latestTemp < tempBounds.min) ||
        (tempBounds.max !== null && latestTemp > tempBounds.max));

    if (doLow || tempOutOfBand) {
      return {
        adjustedKg: baseKg * TempDoAdjuster.REDUCTION_FACTOR,
        adjusted: true,
        reason: doLow
          ? 'Dissolved oxygen is below the safe threshold — quota reduced.'
          : 'Temperature is outside the safe band — quota reduced.',
      };
    }

    return { adjustedKg: baseKg, adjusted: false, reason: null };
  }
}
