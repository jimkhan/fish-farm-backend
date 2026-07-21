import { SpeciesCategory } from '../../ponds/domain/species.entity';
import { HarvestGrade } from '../../harvest/domain/harvest.entity';
import { MARKET_RATE_MINOR_PER_KG } from './market-rate.config';

export interface RemainingBiomassInput {
  readonly speciesCategory: SpeciesCategory;
  readonly biomassKg: number;
}

/**
 * F2/R5 (AC-110). Remaining (un-harvested) biomass has no `grade` yet — grade is chosen at
 * harvest time, per harvest, not a fixed species property (module doc §2.4 R5: market rate is
 * configured "per species/grade," two independent axes; confirmed no source anywhere ties a
 * species to one grade). Resolved as a documented judgment call, reusing the same
 * `Species.category` axis TASK-021 already established for feed-type derivation: `PRAWN` (SPF
 * Golda — the system's export-certified species, GLOSSARY) assumes `EXPORT`; `FISH` (Carp/Parse/
 * Grass Carp — domestic table fish) assumes `LOCAL`. Flagged for human confirmation, same
 * category as `DEFAULT_WATER_THRESHOLDS`' alkalinity resolution.
 */
export function assumedGradeForCategory(category: SpeciesCategory): HarvestGrade {
  return category === 'PRAWN' ? 'EXPORT' : 'LOCAL';
}

/** Σ over species of remaining biomass × the market rate for its assumed grade. */
export function calculateRemainingHarvestValueMinor(inputs: readonly RemainingBiomassInput[]): number {
  return inputs.reduce((sum, input) => {
    const grade = assumedGradeForCategory(input.speciesCategory);
    const rateMinorPerKg = MARKET_RATE_MINOR_PER_KG[grade];
    return sum + Math.round(input.biomassKg * rateMinorPerKg);
  }, 0);
}
