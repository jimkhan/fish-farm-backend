import { Controller, Get, Param } from '@nestjs/common';
import { GetBatchUseCase } from '../application/get-batch.usecase';
import { ListBatchesUseCase } from '../application/list-batches.usecase';
import { BatchResponse, toBatchResponse } from './dtos/batch.response';

/** `BatchesController` (TASK-019, CON-016/017). Member-only (any role) — reads only. */
@Controller('projects/:projectId/batches')
export class BatchesController {
  constructor(
    private readonly listBatches: ListBatchesUseCase,
    private readonly getBatch: GetBatchUseCase,
  ) {}

  @Get()
  async listHandler(): Promise<BatchResponse[]> {
    const batches = await this.listBatches.execute();
    return batches.map(toBatchResponse);
  }

  @Get(':batchId')
  async getHandler(@Param('batchId') batchId: string): Promise<BatchResponse> {
    const batch = await this.getBatch.execute(batchId);
    return toBatchResponse(batch);
  }
}
