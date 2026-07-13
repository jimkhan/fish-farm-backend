import { Inject, Injectable } from '@nestjs/common';
import { NotFoundError } from '../../../shared-kernel/errors/domain-error';
import { Batch } from '../domain/batch.entity';
import { BATCH_REPOSITORY, BatchRepositoryPort } from './ports/batch-repository.port';

/** `GET /projects/{projectId}/batches/{batchId}` (CON-017). Member-only (any role). */
@Injectable()
export class GetBatchUseCase {
  constructor(@Inject(BATCH_REPOSITORY) private readonly batches: BatchRepositoryPort) {}

  async execute(batchId: string): Promise<Batch> {
    const batch = await this.batches.findById(batchId);
    if (!batch) {
      throw new NotFoundError('Batch not found.');
    }
    return batch;
  }
}
