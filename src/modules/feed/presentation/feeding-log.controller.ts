import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { rolesWithCapability } from '../../identity/domain/role-capability-matrix';
import { Roles } from '../../identity/presentation/roles.decorator';
import { RolesGuard } from '../../identity/presentation/roles.guard';
import { LogFeedingUseCase } from '../application/log-feeding.usecase';
import { CreateFeedingLogDto } from './dtos/create-feeding-log.dto';
import { FeedingLogResponse, toFeedingLogResponse } from './dtos/feeding-log.response';

/** `FeedingLogController` (TASK-022, CON-018, F5/F6, AC-074/075/077). Worker mobile logs feedings (module doc §2.3); Partners are read-only. */
@Controller('projects/:projectId/batches/:batchId/feedings')
@UseGuards(RolesGuard)
@Roles(rolesWithCapability('canWrite'), 'Partners have read-only access.')
export class FeedingLogController {
  constructor(private readonly logFeeding: LogFeedingUseCase) {}

  @Post()
  async createHandler(
    @Param('batchId') batchId: string,
    @Body() body: CreateFeedingLogDto,
  ): Promise<FeedingLogResponse> {
    const log = await this.logFeeding.execute(batchId, {
      inventoryItemId: body.inventoryItemId,
      qtyKg: body.qtyKg,
      fedAt: new Date(body.fedAt),
      observation: body.observation,
      clientMutationId: body.clientMutationId,
    });
    return toFeedingLogResponse(log);
  }
}
