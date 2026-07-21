import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { rolesWithCapability } from '../../identity/domain/role-capability-matrix';
import { Roles } from '../../identity/presentation/roles.decorator';
import { RolesGuard } from '../../identity/presentation/roles.guard';
import { RecordHarvestUseCase } from '../application/record-harvest.usecase';
import { CreateHarvestDto } from './dtos/create-harvest.dto';
import { HarvestResponse, toHarvestResponse } from './dtos/harvest.response';

/** `HarvestController` (TASK-031, CON-021, F7, AC-102/103/106). Worker mobile records harvests (module doc §2.3); Partners are read-only. */
@Controller('projects/:projectId/batches/:batchId/harvests')
@UseGuards(RolesGuard)
@Roles(rolesWithCapability('canWrite'), 'Partners have read-only access.')
export class HarvestController {
  constructor(private readonly recordHarvest: RecordHarvestUseCase) {}

  @Post()
  async createHandler(
    @Param('batchId') batchId: string,
    @Body() body: CreateHarvestDto,
  ): Promise<HarvestResponse> {
    const result = await this.recordHarvest.execute(batchId, {
      quantity: body.quantity,
      totalWeightKg: body.totalWeightKg,
      grade: body.grade,
      harvestedOn: new Date(body.harvestedOn),
      revenueMinor: body.revenue?.amountMinor,
      clientMutationId: body.clientMutationId,
    });
    return toHarvestResponse(result);
  }
}
