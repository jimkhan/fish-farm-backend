import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { rolesWithCapability } from '../../identity/domain/role-capability-matrix';
import { Roles } from '../../identity/presentation/roles.decorator';
import { RolesGuard } from '../../identity/presentation/roles.guard';
import { ListReadingsUseCase } from '../application/list-readings.usecase';
import { RecordReadingUseCase } from '../application/record-reading.usecase';
import { WaterParameter } from '../domain/water-reading.entity';
import { CreateWaterReadingDto } from './dtos/create-water-reading.dto';
import { WaterReadingResponse, toWaterReadingResponse } from './dtos/water-reading.response';

/**
 * `WaterReadingsController` (TASK-023, CON-025/026, AC-083/090). `ProjectScopeGuard` already
 * validated membership; list is open to any role (Partner read-only, module doc §2.3); recording
 * a reading is an operational write, gated the same as stocking/mortality (`canWrite`).
 */
@Controller('projects/:projectId/ponds/:pondId/water-readings')
export class WaterReadingsController {
  constructor(
    private readonly listReadings: ListReadingsUseCase,
    private readonly recordReading: RecordReadingUseCase,
  ) {}

  @Get()
  async listHandler(
    @Param('pondId') pondId: string,
    @Query('parameter') parameter?: WaterParameter,
  ): Promise<WaterReadingResponse[]> {
    const readings = await this.listReadings.execute(pondId, parameter);
    return readings.map(toWaterReadingResponse);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles(rolesWithCapability('canWrite'), 'Partners have read-only access.')
  async recordHandler(
    @Param('pondId') pondId: string,
    @Body() body: CreateWaterReadingDto,
  ): Promise<WaterReadingResponse> {
    const reading = await this.recordReading.execute(pondId, {
      parameter: body.parameter,
      value: body.value,
      readAt: new Date(body.readAt),
      clientMutationId: body.clientMutationId,
    });
    return toWaterReadingResponse(reading);
  }
}
