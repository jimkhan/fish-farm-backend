import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ValidationError } from '../../../shared-kernel/errors/domain-error';
import { rolesWithCapability } from '../../identity/domain/role-capability-matrix';
import { Roles } from '../../identity/presentation/roles.decorator';
import { RolesGuard } from '../../identity/presentation/roles.guard';
import { GetWaterTrendsUseCase } from '../application/get-water-trends.usecase';
import { ListReadingsUseCase } from '../application/list-readings.usecase';
import { RecordReadingUseCase } from '../application/record-reading.usecase';
import { WaterParameter } from '../domain/water-reading.entity';
import { CreateWaterReadingDto } from './dtos/create-water-reading.dto';
import { WaterReadingResponse, toWaterReadingResponse } from './dtos/water-reading.response';
import { WaterTrendsResponse, toWaterTrendsResponse } from './dtos/water-trends.response';

const WATER_PARAMETERS = new Set<WaterParameter>([
  'DO',
  'TEMP',
  'PH',
  'AMMONIA',
  'NITRITE',
  'ALKALINITY',
  'SECCHI',
]);

// Default trend window when `from`/`to` are omitted: the trailing 14 days — comfortably wider
// than the 3-day falling-dawn-DO pattern needs, a documented judgment call (the contract/module
// doc name no default). `TREND_MAX_WINDOW_DAYS` bounds an explicit range so a client can't ask
// for an unboundedly large scan of a busy pond's history.
const DEFAULT_TREND_WINDOW_DAYS = 14;
const TREND_MAX_WINDOW_DAYS = 366;

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
    private readonly getWaterTrends: GetWaterTrendsUseCase,
  ) {}

  @Get()
  async listHandler(
    @Param('pondId') pondId: string,
    @Query('parameter') parameter?: WaterParameter,
  ): Promise<WaterReadingResponse[]> {
    const readings = await this.listReadings.execute(pondId, parameter);
    return readings.map(toWaterReadingResponse);
  }

  /**
   * `GET .../water-readings/trends?parameter=DO&from=&to=` (CON-059, AC-087). `parameter` is
   * required (a trend is always of one parameter); `from`/`to` default to the trailing
   * `DEFAULT_TREND_WINDOW_DAYS`. Any member role, like the readings list.
   */
  @Get('trends')
  async trendsHandler(
    @Param('pondId') pondId: string,
    @Query('parameter') parameter?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ): Promise<WaterTrendsResponse> {
    if (!parameter || !WATER_PARAMETERS.has(parameter as WaterParameter)) {
      throw new ValidationError('A valid `parameter` query is required for a trend query.');
    }

    const toDate = to ? new Date(to) : new Date();
    if (Number.isNaN(toDate.getTime())) {
      throw new ValidationError('`to` is not a valid date.');
    }
    const fromDate = from
      ? new Date(from)
      : new Date(toDate.getTime() - DEFAULT_TREND_WINDOW_DAYS * 86_400_000);
    if (Number.isNaN(fromDate.getTime())) {
      throw new ValidationError('`from` is not a valid date.');
    }
    if (fromDate >= toDate) {
      throw new ValidationError('`from` must be before `to`.');
    }
    if (toDate.getTime() - fromDate.getTime() > TREND_MAX_WINDOW_DAYS * 86_400_000) {
      throw new ValidationError(`The trend window may not exceed ${TREND_MAX_WINDOW_DAYS} days.`);
    }

    const trends = await this.getWaterTrends.execute(
      pondId,
      parameter as WaterParameter,
      fromDate,
      toDate,
    );
    return toWaterTrendsResponse(trends);
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
