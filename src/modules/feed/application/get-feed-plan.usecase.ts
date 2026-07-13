import { Inject, Injectable } from '@nestjs/common';
import { NotFoundError } from '../../../shared-kernel/errors/domain-error';
import { BATCH_REPOSITORY, BatchRepositoryPort } from '../../ponds/application/ports/batch-repository.port';
import { SPECIES_REPOSITORY, SpeciesRepositoryPort } from '../../ponds/application/ports/species-repository.port';
import {
  WATER_READING_REPOSITORY,
  WaterReadingRepositoryPort,
} from '../../water/application/ports/water-reading-repository.port';
import {
  WATER_THRESHOLD_REPOSITORY,
  WaterThresholdRepositoryPort,
} from '../../water/application/ports/water-threshold-repository.port';
import { DEFAULT_WATER_THRESHOLDS } from '../../water/domain/default-thresholds';
import { WaterParameter } from '../../water/domain/water-reading.entity';
import { FeedType } from '../../inventory/domain/inventory-item.entity';
import { feedTypeForSpeciesCategory } from '../domain/feed-type';
import { FeedQuotaCalculator } from '../domain/feed-quota.service';
import { SamplingRequiredError } from '../domain/feed-errors';
import { TempDoAdjuster } from '../domain/temp-do-adjuster';

export interface FeedPlanLine {
  readonly feedType: FeedType;
  readonly kg: number;
}

export interface FeedPlan {
  readonly batchId: string;
  readonly totalKg: number;
  readonly adjustedForTempDo: boolean;
  readonly adjustmentReason: string | null;
  readonly lines: readonly FeedPlanLine[];
}

/**
 * `GET /projects/{projectId}/batches/{batchId}/feed-plan` (CON-018a, F1/F2/F3, AC-071/072/073).
 * Member-only, any role (module doc §2.3 — Worker reads it to feed, Owner/Partner may view it
 * too), read-only — no project-closed check (reads stay available on a `CLOSED` project, same as
 * `GetBatchUseCase`). A single-species batch always produces exactly one `lines` entry — the wire
 * schema's `lines` array is forward-compatible shape, not evidence multiple entries are expected
 * here.
 */
@Injectable()
export class GetFeedPlanUseCase {
  private readonly quotaCalculator = new FeedQuotaCalculator();
  private readonly tempDoAdjuster = new TempDoAdjuster();

  constructor(
    @Inject(BATCH_REPOSITORY) private readonly batches: BatchRepositoryPort,
    @Inject(SPECIES_REPOSITORY) private readonly species: SpeciesRepositoryPort,
    @Inject(WATER_READING_REPOSITORY) private readonly readings: WaterReadingRepositoryPort,
    @Inject(WATER_THRESHOLD_REPOSITORY) private readonly thresholds: WaterThresholdRepositoryPort,
  ) {}

  async execute(batchId: string): Promise<FeedPlan> {
    const batch = await this.batches.findById(batchId);
    if (!batch) {
      throw new NotFoundError('Batch not found.');
    }

    const quota = this.quotaCalculator.calculate({
      survivalEstimate: batch.survivalEstimate,
      latestAvgWeightG: batch.latestAvgWeightG,
    });
    if (quota.status === 'SAMPLING_REQUIRED') {
      throw new SamplingRequiredError();
    }

    const [latestDo, latestTemp, doThreshold, tempThreshold, allSpecies] = await Promise.all([
      this.latestValue(batch.pondId, 'DO'),
      this.latestValue(batch.pondId, 'TEMP'),
      this.thresholds.findByParameter('DO'),
      this.thresholds.findByParameter('TEMP'),
      this.species.findAll(),
    ]);

    const speciesEntity = allSpecies.find((s) => s.id === batch.speciesId);
    if (!speciesEntity) {
      throw new NotFoundError('Species not found.');
    }

    const adjustment = this.tempDoAdjuster.adjust({
      baseKg: quota.totalKg,
      latestDo,
      latestTemp,
      doBounds: doThreshold ?? DEFAULT_WATER_THRESHOLDS.DO,
      tempBounds: tempThreshold ?? DEFAULT_WATER_THRESHOLDS.TEMP,
    });

    const feedType = feedTypeForSpeciesCategory(speciesEntity.category);

    return {
      batchId: batch.id,
      totalKg: adjustment.adjustedKg,
      adjustedForTempDo: adjustment.adjusted,
      adjustmentReason: adjustment.reason,
      lines: [{ feedType, kg: adjustment.adjustedKg }],
    };
  }

  private async latestValue(pondId: string, parameter: WaterParameter): Promise<number | null> {
    const [first, ...rest] = await this.readings.findForPond(pondId, parameter);
    if (!first) {
      return null;
    }
    return rest.reduce((latest, r) => (r.readAt > latest.readAt ? r : latest), first).value;
  }
}
