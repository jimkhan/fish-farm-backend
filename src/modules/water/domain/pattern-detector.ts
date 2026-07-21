/**
 * A single dissolved-oxygen reading reduced to what the pattern rule needs — decoupled from the
 * full `WaterReading` entity so the detector stays a pure, trivially-testable function.
 */
export interface DoReadingDatum {
  readonly value: number;
  readonly readAt: Date;
}

/**
 * The early-warning advisory AC-087/R5 call for — a *pattern* signal, deliberately distinct from
 * an instantaneous `WaterThresholdBreached` (a single reading out of range). A falling-dawn-DO
 * advisory can fire even when every individual reading is still inside the safe band (module doc
 * edge case 8): what matters is the trend, not any one value.
 */
export interface FallingDawnDoAdvisory {
  readonly pattern: 'FALLING_DAWN_DO';
  /** How many consecutive daily dawn readings are in the strictly-declining run (≥ threshold). */
  readonly consecutiveDays: number;
  /** The first (highest) dawn reading of the declining run. */
  readonly fromReadAt: Date;
  /** The most recent (lowest) dawn reading of the declining run. */
  readonly toReadAt: Date;
  /** Total decline across the run (`from.value − to.value`, always > 0). */
  readonly dropValue: number;
}

// Bangladesh is UTC+6 year-round (no DST) — a well-known fixed offset, so "dawn" (a local
// wall-clock concept) maps to a fixed UTC window without needing a tz database. Readings are
// stored UTC (CLAUDE.md §5); we shift into local time only to classify time-of-day.
const DHAKA_UTC_OFFSET_MS = 6 * 60 * 60 * 1000;
const MS_PER_DAY = 86_400_000;

/**
 * F3/R5 (AC-087): detects the "falling dawn DO" early-warning pattern. Dissolved oxygen naturally
 * bottoms out around dawn (a night of respiration with no photosynthesis to replenish it), so a
 * *dawn* DO reading is the day's most stressed measurement; a monotonic decline in dawn DO across
 * consecutive days is a classic leading indicator of a developing oxygen crash — worth surfacing
 * before any single reading actually breaches.
 *
 * `consecutiveDays` (3) and the dawn window (local 04:00–09:00) are documented, tunable judgment
 * calls — the module doc leaves the exact "N consecutive" and "dawn" definitions unspecified
 * ("N consecutive falling dawn-DO readings"), the same posture as `SpikeDetector`'s N×/window.
 */
export class PatternDetector {
  constructor(
    private readonly consecutiveDays = 3,
    private readonly dawnStartHourLocal = 4,
    private readonly dawnEndHourLocal = 9,
  ) {}

  /**
   * `readings` is every DO reading for one pond over the queried window (already tenant-scoped).
   * Returns an advisory iff the most recent run of daily dawn readings is strictly decreasing for
   * at least `consecutiveDays` days; otherwise `null`.
   */
  detectFallingDawnDo(readings: readonly DoReadingDatum[]): FallingDawnDoAdvisory | null {
    // 1. Keep only dawn-window readings, collapsing each local day to its earliest dawn reading
    //    (the truest "dawn" measurement if a day happens to have several morning readings).
    const dawnByDay = new Map<number, DoReadingDatum>();
    for (const reading of readings) {
      const localMs = reading.readAt.getTime() + DHAKA_UTC_OFFSET_MS;
      const localHour = Math.floor((((localMs % MS_PER_DAY) + MS_PER_DAY) % MS_PER_DAY) / 3_600_000);
      if (localHour < this.dawnStartHourLocal || localHour >= this.dawnEndHourLocal) {
        continue;
      }
      const localDay = Math.floor(localMs / MS_PER_DAY);
      const existing = dawnByDay.get(localDay);
      if (!existing || reading.readAt < existing.readAt) {
        dawnByDay.set(localDay, reading);
      }
    }

    if (dawnByDay.size < this.consecutiveDays) {
      return null;
    }

    // 2. Order the one-per-day dawn readings chronologically.
    const series = [...dawnByDay.entries()]
      .sort(([dayA], [dayB]) => dayA - dayB)
      .map(([, reading]) => reading);

    // 3. Measure the strictly-decreasing run that ends at the most recent day (a *currently*
    //    falling trend — a decline that already reversed is no longer an early warning).
    let runStart = series.length - 1;
    for (let i = series.length - 1; i > 0; i--) {
      if (series[i].value < series[i - 1].value) {
        runStart = i - 1;
      } else {
        break;
      }
    }

    const runLength = series.length - runStart;
    if (runLength < this.consecutiveDays) {
      return null;
    }

    const first = series[runStart];
    const last = series[series.length - 1];
    return {
      pattern: 'FALLING_DAWN_DO',
      consecutiveDays: runLength,
      fromReadAt: first.readAt,
      toReadAt: last.readAt,
      dropValue: first.value - last.value,
    };
  }
}
