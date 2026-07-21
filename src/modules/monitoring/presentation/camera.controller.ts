import { Controller, Get } from '@nestjs/common';
import { GetCameraConfigUseCase } from '../application/get-camera-config.usecase';
import { CameraConfigResponse, toCameraConfigResponse } from './dtos/camera-config.response';

/**
 * `CameraController` (TASK-035, CON-036, AC-118/119/124). Member-only (any role) — reads only,
 * same pattern as `BiomassController`/`FeedController`/`SamplingController.growthHandler`/
 * `FcrController`.
 */
@Controller('projects/:projectId/camera')
export class CameraController {
  constructor(private readonly getCameraConfig: GetCameraConfigUseCase) {}

  @Get()
  async cameraHandler(): Promise<CameraConfigResponse> {
    const camera = await this.getCameraConfig.execute();
    return toCameraConfigResponse(camera);
  }
}
