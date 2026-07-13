import { Body, Controller, Get, ParseArrayPipe, Put, UseGuards } from '@nestjs/common';
import { rolesWithCapability } from '../../identity/domain/role-capability-matrix';
import { Roles } from '../../identity/presentation/roles.decorator';
import { RolesGuard } from '../../identity/presentation/roles.guard';
import { ConfigureThresholdsUseCase } from '../application/configure-thresholds.usecase';
import { EffectiveThreshold, GetThresholdsUseCase } from '../application/get-thresholds.usecase';
import { WaterThresholdDto } from './dtos/water-threshold.dto';

/**
 * `WaterThresholdsController` (TASK-023, CON-027/027a, AC-085). Read is open to any role; write
 * is Owner-only per CON-027's own contract description ("OWNER").
 */
@Controller('projects/:projectId/water-thresholds')
export class WaterThresholdsController {
  constructor(
    private readonly getThresholds: GetThresholdsUseCase,
    private readonly configureThresholds: ConfigureThresholdsUseCase,
  ) {}

  @Get()
  async getHandler(): Promise<EffectiveThreshold[]> {
    return this.getThresholds.execute();
  }

  @Put()
  @UseGuards(RolesGuard)
  @Roles(rolesWithCapability('canManageWaterThresholds'), 'Only the Owner configures thresholds.')
  async putHandler(
    @Body(new ParseArrayPipe({ items: WaterThresholdDto, whitelist: true, forbidNonWhitelisted: true }))
    body: WaterThresholdDto[],
  ): Promise<EffectiveThreshold[]> {
    const saved = await this.configureThresholds.execute(
      body.map((t) => ({ parameter: t.parameter, min: t.min, max: t.max, critical: t.critical })),
    );
    return saved.map((t) => ({ parameter: t.parameter, min: t.min, max: t.max, critical: t.critical }));
  }
}
