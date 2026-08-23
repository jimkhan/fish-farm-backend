import { Controller, Get, UseGuards } from '@nestjs/common';
import { rolesWithCapability } from '../../identity/domain/role-capability-matrix';
import { Roles } from '../../identity/presentation/roles.decorator';
import { RolesGuard } from '../../identity/presentation/roles.guard';
import { GetCameraConfigUseCase } from '../application/get-camera-config.usecase';
import { CameraConfigResponse, toCameraConfigResponse } from './dtos/camera-config.response';

/**
 * `CameraController` (TASK-035, CON-036). Gated to `canAccessOperations` — Investors are
 * finance-focused and do not receive the live camera surface.
 */
@Controller('projects/:projectId/camera')
@UseGuards(RolesGuard)
@Roles(rolesWithCapability('canAccessOperations'), 'Operations are not available for your role.')
export class CameraController {
  constructor(private readonly getCameraConfig: GetCameraConfigUseCase) {}

  @Get()
  async cameraHandler(): Promise<CameraConfigResponse> {
    const camera = await this.getCameraConfig.execute();
    return toCameraConfigResponse(camera);
  }
}
