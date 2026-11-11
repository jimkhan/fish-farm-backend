import { Inject, Injectable } from '@nestjs/common';
import { NotFoundError } from '../../../shared-kernel/errors/domain-error';
import { BATCH_REPOSITORY, BatchRepositoryPort } from '../../ponds/application/ports/batch-repository.port';
import { SPECIES_REPOSITORY, SpeciesRepositoryPort } from '../../ponds/application/ports/species-repository.port';
import { aggregateBiomassBySpecies } from '../../ponds/domain/biomass.service';
import { calculateRemainingHarvestValueMinor } from '../domain/remaining-harvest-value.service';
import {
  FINANCIAL_TXN_REPOSITORY,
  FinancialTxnRepositoryPort,
} from './ports/financial-txn-repository.port';

export interface FinanceSummaryResult {
  readonly totalCostMinor: number;
  readonly totalRevenueMinor: number;
  readonly netProfitMinor: number;
  readonly remainingHarvestValueMinor: number;
  readonly projectedRoiPct: number;
}

/**
 * `GET /projects/{projectId}/finance/summary` (CON-034, F2/F3, AC-110/111). OWNER + PARTNER
 * (read-only); hidden from WORKER — same `canAccessFinanceSettings` gate as the transaction list.
 *
 * R4: netProfit = Σrevenue − Σcost (recorded transactions only). projectedRoiPct = (netProfit +
 * remainingHarvestValue) ÷ totalCost × 100 — guarded to `0` when `totalCost` is `0` (a project
 * with no recorded costs yet has no meaningful ROI denominator; `0` is a safe, non-fabricated
 * default rather than `Infinity`/`NaN`, a documented judgment call since the module doc doesn't
 * name this specific edge). The contract's own `FinanceSummary` has no area-adjusted field, so
 * R4's "optionally divided by area" isn't computed here — nothing in CON-034 exposes it.
 */
@Injectable()
export class GetFinanceSummaryUseCase {
  constructor(
    @Inject(FINANCIAL_TXN_REPOSITORY) private readonly txns: FinancialTxnRepositoryPort,
    @Inject(BATCH_REPOSITORY) private readonly batches: BatchRepositoryPort,
    @Inject(SPECIES_REPOSITORY) private readonly species: SpeciesRepositoryPort,
  ) {}

  async execute(): Promise<FinanceSummaryResult> {
    const [allTxns, allBatches, allSpecies] = await Promise.all([
      this.txns.findAllInCurrentProject(),
      this.batches.findAllInCurrentProject(),
      this.species.findAll(),
    ]);

    const totalCostMinor = allTxns
      .filter((t) => t.kind === 'COST')
      .reduce((sum, t) => sum + t.amountMinor, 0);
    const totalRevenueMinor = allTxns
      .filter((t) => t.kind === 'REVENUE')
      .reduce((sum, t) => sum + t.amountMinor, 0);
    const netProfitMinor = totalRevenueMinor - totalCostMinor;

    const speciesById = new Map(allSpecies.map((s) => [s.id, s]));
    const perSpeciesBiomass = aggregateBiomassBySpecies(
      allBatches.map((batch) => ({
        speciesId: batch.speciesId,
        survivalEstimate: batch.survivalEstimate,
        survivorsExcludingHarvest: batch.survivorsExcludingHarvest,
        initialCount: batch.initialCount,
        latestAvgWeightG: batch.latestAvgWeightG,
      })),
    );
    const remainingHarvestValueMinor = calculateRemainingHarvestValueMinor(
      perSpeciesBiomass.map((entry) => {
        const speciesEntity = speciesById.get(entry.speciesId);
        if (!speciesEntity) {
          throw new NotFoundError('Species not found.');
        }
        return { speciesCategory: speciesEntity.category, biomassKg: entry.biomassKg };
      }),
    );

    const projectedRoiPct =
      totalCostMinor === 0
        ? 0
        : ((netProfitMinor + remainingHarvestValueMinor) / totalCostMinor) * 100;

    return {
      totalCostMinor,
      totalRevenueMinor,
      netProfitMinor,
      remainingHarvestValueMinor,
      projectedRoiPct,
    };
  }
}
