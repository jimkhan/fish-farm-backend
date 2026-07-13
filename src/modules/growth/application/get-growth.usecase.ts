import { Inject, Injectable } from '@nestjs/common';
import { NotFoundError } from '../../../shared-kernel/errors/domain-error';
import { BATCH_REPOSITORY, BatchRepositoryPort } from '../../ponds/application/ports/batch-repository.port';
import { AdgSgrCalculator } from '../domain/adg-sgr.service';
import { Sampling } from '../domain/sampling.entity';
import { SAMPLING_REPOSITORY, SamplingRepositoryPort } from './ports/sampling-repository.port';

export interface GrowthResult {
  readonly batchId: string;
  readonly speciesId: string;
  readonly samplings: Sampling[];
  readonly adgGPerDay: number | null;
  readonly sgrPercentPerDay: number | null;
  /** Edge case 5: a negative rate is a real anomaly, surfaced rather than hidden. */
  readonly growthAnomaly: boolean;
}

/**
 * `GET /projects/{projectId}/batches/{batchId}/growth` (CON-052, FT-042, AC-097, R5). CON-052 was
 * reserved for a combined "ADG/SGR/FCR read" — this task activates only the ADG/SGR half; FCR is
 * TASK-030's explicit non-goal here and stays unimplemented (no `fcr` field on this response).
 * "Per species" (module doc F5) resolves to "this batch's species" — the route is batch-scoped,
 * and each batch has exactly one species (ERD `BATCH.species_id`), so there is no cross-batch
 * aggregation to invent.
 */
@Injectable()
export class GetGrowthUseCase {
  private readonly calculator = new AdgSgrCalculator();

  constructor(
    @Inject(SAMPLING_REPOSITORY) private readonly samplings: SamplingRepositoryPort,
    @Inject(BATCH_REPOSITORY) private readonly batches: BatchRepositoryPort,
  ) {}

  async execute(batchId: string): Promise<GrowthResult> {
    const batch = await this.batches.findById(batchId);
    if (!batch) {
      throw new NotFoundError('Batch not found.');
    }

    const history = await this.samplings.findForBatch(batchId);

    // R5: requires >= 2 samplings; "consecutive" means the two most recent.
    if (history.length < 2) {
      return {
        batchId,
        speciesId: batch.speciesId,
        samplings: history,
        adgGPerDay: null,
        sgrPercentPerDay: null,
        growthAnomaly: false,
      };
    }

    const later = history[history.length - 1];
    const earlier = history[history.length - 2];
    const metrics = this.calculator.compute(
      { avgWeightG: earlier.avgWeightG, sampledOn: earlier.sampledOn },
      { avgWeightG: later.avgWeightG, sampledOn: later.sampledOn },
    );

    return {
      batchId,
      speciesId: batch.speciesId,
      samplings: history,
      adgGPerDay: metrics?.adgGPerDay ?? null,
      sgrPercentPerDay: metrics?.sgrPercentPerDay ?? null,
      growthAnomaly: (metrics?.adgGPerDay ?? 0) < 0,
    };
  }
}
