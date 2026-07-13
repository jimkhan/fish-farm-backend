export interface BwBand {
  /** Inclusive lower bound in grams; `null` covers everything below `maxWeightG` (the fry band). */
  readonly minWeightG: number | null;
  /** Exclusive upper bound in grams; `null` covers everything above `minWeightG` (the grow-out band). */
  readonly maxWeightG: number | null;
  readonly bwPercent: number;
}

/**
 * R1 seed defaults (module doc §6.4 open question — "BW% table default bands per species/stage —
 * source values (advisory)" — resolved to "seed sensible declining bands fry→grow-out; owner-
 * tunable"). Owner-tunable persistence/config API is explicitly deferred (module doc §4.7: "BW%
 * table config may later warrant a config endpoint... not required for MVP compute," same
 * deferral as `CON-049`) — these bands are a documented default the pure `FeedQuotaCalculator` is
 * parameterized over, never hardcoded inside the calculator itself (R1's "not hard-coded" is about
 * the calculator's *logic*, not about whether a config UI exists yet), the same seeded-constant
 * pattern as `DEFAULT_WATER_THRESHOLDS` (TASK-023). Bands are contiguous and unbounded at both
 * ends so every non-negative weight resolves to exactly one band — no "no matching band" case.
 */
export const DEFAULT_BW_BANDS: readonly BwBand[] = [
  { minWeightG: null, maxWeightG: 5, bwPercent: 10 },
  { minWeightG: 5, maxWeightG: 20, bwPercent: 7 },
  { minWeightG: 20, maxWeightG: 100, bwPercent: 5 },
  { minWeightG: 100, maxWeightG: 250, bwPercent: 3 },
  { minWeightG: 250, maxWeightG: null, bwPercent: 2 },
];

/** Resolves the band whose [min, max) range contains `avgWeightG` (min inclusive, max exclusive). */
export function resolveBwBand(
  avgWeightG: number,
  bands: readonly BwBand[] = DEFAULT_BW_BANDS,
): BwBand {
  const match = bands.find(
    (band) =>
      (band.minWeightG === null || avgWeightG >= band.minWeightG) &&
      (band.maxWeightG === null || avgWeightG < band.maxWeightG),
  );
  // Bands are seeded contiguous/unbounded at both ends (see above) — a non-negative weight always
  // resolves; the fallback only guards a caller-supplied custom `bands` array that isn't.
  return match ?? bands[bands.length - 1];
}
