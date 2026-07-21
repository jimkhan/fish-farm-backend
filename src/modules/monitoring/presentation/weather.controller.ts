import { Controller, Get } from '@nestjs/common';
import { GetWeatherUseCase } from '../application/get-weather.usecase';
import { toWeatherSnapshotResponse, WeatherSnapshotResponse } from './dtos/weather-snapshot.response';

/**
 * `WeatherController` (TASK-036, CON-037, AC-120/121/124). Member-only (any role) — reads only,
 * same pattern as `CameraController`/`FcrController`.
 */
@Controller('projects/:projectId/weather')
export class WeatherController {
  constructor(private readonly getWeather: GetWeatherUseCase) {}

  @Get()
  async weatherHandler(): Promise<WeatherSnapshotResponse> {
    const result = await this.getWeather.execute();
    return toWeatherSnapshotResponse(result);
  }
}
