import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { rolesWithCapability } from '../../identity/domain/role-capability-matrix';
import { Roles } from '../../identity/presentation/roles.decorator';
import { RolesGuard } from '../../identity/presentation/roles.guard';
import { GetWeatherUseCase } from '../application/get-weather.usecase';
import { RefreshProjectWeatherUseCase } from '../application/refresh-project-weather.usecase';
import { toWeatherSnapshotResponse, WeatherSnapshotResponse } from './dtos/weather-snapshot.response';

/**
 * `WeatherController` (TASK-036, CON-037, AC-120/121/124). GET is member-only; POST refresh is
 * Owner/Worker (Partner is read-only per design W-16).
 */
@Controller('projects/:projectId/weather')
export class WeatherController {
  constructor(
    private readonly getWeather: GetWeatherUseCase,
    private readonly refreshWeather: RefreshProjectWeatherUseCase,
  ) {}

  @Get()
  @UseGuards(RolesGuard)
  @Roles(rolesWithCapability('canAccessOperations'), 'Operations are not available for your role.')
  async weatherHandler(): Promise<WeatherSnapshotResponse> {
    const result = await this.getWeather.execute();
    return toWeatherSnapshotResponse(result);
  }

  @Post('refresh')
  @UseGuards(RolesGuard)
  @Roles(rolesWithCapability('canWrite'), 'Partners have read-only access.')
  async refreshHandler(): Promise<WeatherSnapshotResponse> {
    const result = await this.refreshWeather.execute();
    return toWeatherSnapshotResponse(result);
  }
}
