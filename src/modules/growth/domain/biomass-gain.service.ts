export interface BiomassGainInput {
  /** Current surviving count — the same multiplier `Batch.biomassGrams` already uses (this
   * codebase never reconstructs a historical population-at-sampling-time count). */
  readonly survivalEstimate: number;
  /** Every sampling for this batch, ascending by `sampledOn` (oldest first). */
  readonly samplingsAscending: readonly { avgWeightG: number }[];
  readonly harvestedWeightKg: number;
}

/**
 * Biomass gain since the batch's first sampling (TASK-030, MOD-07 R3, edge case 2). Weight gain
 * per surviving fish (latest sampling − first sampling) × the current surviving count, plus
 * whatever has already been harvested — standard aquaculture FCR practice: a partial harvest
 * must count toward "gain," or FCR would look artificially worse right after every harvest
 * (human-confirmed judgment call, no spec source states this explicitly).
 *
 * Returns `null` — never a fabricated number — when fewer than 2 samplings exist (edge case 2:
 * "FCR before biomass gain is measurable... is unavailable, not fabricated"), the same `≥2
 * samplings` threshold `AdgSgrCalculator`/`GetGrowthUseCase` already use for ADG/SGR (R5).
 */
export function calculateBiomassGainKg(input: BiomassGainInput): number | null {
  if (input.samplingsAscending.length < 2) {
    return null;
  }
  const first = input.samplingsAscending[0];
  const latest = input.samplingsAscending[input.samplingsAscending.length - 1];
  const weightGainGramsPerFish = latest.avgWeightG - first.avgWeightG;
  const currentGainKg = (input.survivalEstimate * weightGainGramsPerFish) / 1000;
  return currentGainKg + input.harvestedWeightKg;
}
