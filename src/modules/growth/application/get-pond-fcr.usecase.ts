import { Inject, Injectable } from '@nestjs/common';
import { NotFoundError } from '../../../shared-kernel/errors/domain-error';
import { BATCH_REPOSITORY, BatchRepositoryPort } from '../../ponds/application/ports/batch-repository.port';
import { POND_REPOSITORY, PondRepositoryPort } from '../../ponds/application/ports/pond-repository.port';
import { HARVEST_REPOSITORY, HarvestRepositoryPort } from '../../harvest/application/ports/harvest-repository.port';
import { calculateBiomassGainKg } from '../domain/biomass-gain.service';
import { calculateFcr } from '../domain/fcr.service';
import { calculateSurvivalRate } from '../domain/survival.service';
import {
  POND_FEED_ACCUMULATOR_REPOSITORY,
  PondFeedAccumulatorRepositoryPort,
} from './ports/pond-feed-accumulator-repository.port';
import { SAMPLING_REPOSITORY, SamplingRepositoryPort } from './ports/sampling-repository.port';

export interface BatchSurvival {
  readonly batchId: string;
  readonly speciesId: string;
  readonly survivalRate: number;
}

export interface PondFcrResult {
  readonly pondId: string;
  readonly totalFeedKg: number;
  /** `null` when no batch in the pond has ≥2 samplings yet — never fabricated (edge case 2). */
  readonly biomassGainKg: number | null;
  /** `null` under the same condition, or when gain is non-positive (R3/AC-098). */
  readonly fcr: number | null;
  readonly batches: BatchSurvival[];
}

/**
 * `GET /projects/{projectId}/ponds/{pondId}/fcr` (CON-058, F6, AC-098/099, R3/R4). Member-only —
 * no `@Roles()` gate, same as every other read-model query in MOD-04/05/07
 * (`BiomassController`/`FeedController`/`SamplingController.growthHandler`); Partner is
 * read-only everywhere but never excluded from reads.
 *
 * FCR is computed **at pond level only** (RISK-007 — never per-species/per-batch): the pond's
 * accumulated feed total (`PondFeedAccumulatorRepositoryPort`, fed by `OnFeedingLoggedHandler`)
 * against the **summed** biomass gain across every batch in the pond (a pond may carry more than
 * one batch in polyculture). A batch missing ≥2 samplings contributes nothing to the sum rather
 * than making the whole pond's FCR unavailable — partial information beats none when at least one
 * batch in the pond has a measurable gain. Survival rate (AC-099) is reported per batch, since
 * that AC is explicitly batch-scoped, unlike FCR.
 */
@Injectable()
export class GetPondFcrUseCase {
  constructor(
    @Inject(POND_REPOSITORY) private readonly ponds: PondRepositoryPort,
    @Inject(BATCH_REPOSITORY) private readonly batches: BatchRepositoryPort,
    @Inject(SAMPLING_REPOSITORY) private readonly samplings: SamplingRepositoryPort,
    @Inject(HARVEST_REPOSITORY) private readonly harvests: HarvestRepositoryPort,
    @Inject(POND_FEED_ACCUMULATOR_REPOSITORY)
    private readonly accumulator: PondFeedAccumulatorRepositoryPort,
  ) {}

  async execute(pondId: string): Promise<PondFcrResult> {
    const pond = await this.ponds.findById(pondId);
    if (!pond) {
      throw new NotFoundError('Pond not found.');
    }

    const [allBatches, allHarvests, totalFeedKg] = await Promise.all([
      this.batches.findAllInCurrentProject(),
      this.harvests.findAllInCurrentProject(),
      this.accumulator.findTotalFeedKgForPond(pondId),
    ]);
    const pondBatches = allBatches.filter((batch) => batch.pondId === pondId);

    const batchResults: BatchSurvival[] = [];
    let gainSumKg: number | null = null;

    for (const batch of pondBatches) {
      batchResults.push({
        batchId: batch.id,
        speciesId: batch.speciesId,
        survivalRate: calculateSurvivalRate(batch.survivalEstimate, batch.initialCount),
      });

      const history = await this.samplings.findForBatch(batch.id);
      const harvestedWeightKg = allHarvests
        .filter((harvest) => harvest.batchId === batch.id)
        .reduce((sum, harvest) => sum + harvest.totalWeightKg, 0);

      const batchGainKg = calculateBiomassGainKg({
        survivalEstimate: batch.survivalEstimate,
        samplingsAscending: history,
        harvestedWeightKg,
      });
      if (batchGainKg !== null) {
        gainSumKg = (gainSumKg ?? 0) + batchGainKg;
      }
    }

    return {
      pondId,
      totalFeedKg,
      biomassGainKg: gainSumKg,
      fcr: calculateFcr(totalFeedKg, gainSumKg),
      batches: batchResults,
    };
  }
}
