import { Inject, Injectable } from '@nestjs/common';
import { Batch } from '../domain/batch.entity';
import { BATCH_REPOSITORY, BatchRepositoryPort } from './ports/batch-repository.port';

/** `GET /projects/{projectId}/batches` (CON-016). Member-only (any role). */
@Injectable()
export class ListBatchesUseCase {
  constructor(@Inject(BATCH_REPOSITORY) private readonly batches: BatchRepositoryPort) {}

  async execute(): Promise<Batch[]> {
    return this.batches.findAllInCurrentProject();
  }
}
