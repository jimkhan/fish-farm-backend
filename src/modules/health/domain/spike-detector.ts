export interface MortalityDatum {
  readonly count: number;
  readonly occurredAt: Date;
}

/**
 * F3/R6 (AC-100): flags a mortality spike by comparing a day's total for a batch against the
 * trailing `windowDays`-day daily average for the same batch. Requires an established non-zero
 * baseline — a batch's first-ever mortality (or an all-zero trailing history) never flags, since
 * "N× zero" is degenerate and would spike-alert on day one of every project. `multiplier`/
 * `windowDays` defaults (3×, 7 days) are a documented, tunable judgment call — the module doc's
 * own open question leaves the exact threshold unspecified ("N× the trailing 7-day average").
 */
export class SpikeDetector {
  constructor(
    private readonly multiplier = 3,
    private readonly windowDays = 7,
  ) {}

  /**
   * `records` is every mortality datum for one batch that could fall in the trailing window or
   * on `referenceDate`'s calendar day (UTC) — typically the result of one repository query
   * spanning `[referenceDate - windowDays, referenceDate + 1 day)`.
   */
  isSpike(records: readonly MortalityDatum[], referenceDate: Date): boolean {
    const dayStart = startOfUtcDay(referenceDate);
    const dayEnd = addUtcDays(dayStart, 1);
    const windowStart = addUtcDays(dayStart, -this.windowDays);

    let todayTotal = 0;
    let trailingTotal = 0;
    for (const record of records) {
      if (record.occurredAt >= dayStart && record.occurredAt < dayEnd) {
        todayTotal += record.count;
      } else if (record.occurredAt >= windowStart && record.occurredAt < dayStart) {
        trailingTotal += record.count;
      }
    }

    const baseline = trailingTotal / this.windowDays;
    return baseline > 0 && todayTotal > baseline * this.multiplier;
  }
}

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addUtcDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}
