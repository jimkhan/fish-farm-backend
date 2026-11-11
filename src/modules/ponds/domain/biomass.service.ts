/**
 * Pure domain service (TASK-019, MOD-04 F5/R6, AC-066, CON-043). Aggregates biomass per species
 * across a project's batches. A batch with no sampling yet contributes 0 (not null) to the sum —
 * `BiomassOverview.perSpecies[].biomassKg` is a plain, non-nullable number in the contract; the
 * per-batch "no weight yet" fact (R6) is visible on the individual `Batch` response instead
 * (`latestAvgWeightG: null`), not lost here.
 */
export interface BiomassBatchInput {
  readonly speciesId: string;
  /** Fish still in the pond — drives biomass. */
  readonly survivalEstimate: number;
  /** Fish that did not die — drives survival rate. Excludes harvest; see `Batch`. */
  readonly survivorsExcludingHarvest: number;
  readonly initialCount: number;
  readonly latestAvgWeightG: number | null;
}

export interface SpeciesBiomass {
  readonly speciesId: string;
  readonly biomassKg: number;
  readonly survivalRate: number;
}

export function aggregateBiomassBySpecies(batches: BiomassBatchInput[]): SpeciesBiomass[] {
  const bySpecies = new Map<string, { biomassGrams: number; survivors: number; initial: number }>();

  for (const batch of batches) {
    const entry = bySpecies.get(batch.speciesId) ?? { biomassGrams: 0, survivors: 0, initial: 0 };
    // Biomass uses stock still in the pond; survival rate uses fish that did not die. Harvested
    // fish leave the first and stay in the second — they were sold, not lost (AC-099 amended).
    entry.biomassGrams +=
      batch.latestAvgWeightG === null ? 0 : batch.survivalEstimate * batch.latestAvgWeightG;
    entry.survivors += batch.survivorsExcludingHarvest;
    entry.initial += batch.initialCount;
    bySpecies.set(batch.speciesId, entry);
  }

  return Array.from(bySpecies.entries()).map(([speciesId, totals]) => ({
    speciesId,
    biomassKg: totals.biomassGrams / 1000,
    survivalRate: totals.initial === 0 ? 0 : totals.survivors / totals.initial,
  }));
}

export function totalBiomassKg(perSpecies: SpeciesBiomass[]): number {
  return perSpecies.reduce((sum, species) => sum + species.biomassKg, 0);
}
