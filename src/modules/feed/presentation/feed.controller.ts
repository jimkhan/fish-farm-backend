import { Controller, Get, Param } from '@nestjs/common';
import { GetFeedPlanUseCase } from '../application/get-feed-plan.usecase';
import { FeedPlanResponse, toFeedPlanResponse } from './dtos/feed-plan.response';

/** `FeedController` (TASK-021, CON-018a, AC-071/072/073). Member-only (any role) — reads only. */
@Controller('projects/:projectId/batches/:batchId/feed-plan')
export class FeedController {
  constructor(private readonly getFeedPlan: GetFeedPlanUseCase) {}

  @Get()
  async getHandler(@Param('batchId') batchId: string): Promise<FeedPlanResponse> {
    const plan = await this.getFeedPlan.execute(batchId);
    return toFeedPlanResponse(plan);
  }
}
