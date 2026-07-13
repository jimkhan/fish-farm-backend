import { Body, Controller, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import { UnauthenticatedError } from '../../../shared-kernel/errors/domain-error';
import { RegisterDeviceUseCase } from '../application/register-device.usecase';
import { RegisterDeviceDto } from './dtos/register-device.dto';

interface RequestWithUser {
  user?: { id: string };
}

/** `DevicesController` (TASK-016, CON-045, AC-053). No `:projectId` — own auth check, like `/me`. */
@Controller('notifications/devices')
export class DevicesController {
  constructor(private readonly registerDevice: RegisterDeviceUseCase) {}

  @Post()
  @HttpCode(HttpStatus.NO_CONTENT)
  async registerHandler(
    @Req() req: RequestWithUser,
    @Body() body: RegisterDeviceDto,
  ): Promise<void> {
    if (!req.user) {
      throw new UnauthenticatedError();
    }
    await this.registerDevice.execute(req.user.id, {
      fcmToken: body.fcmToken,
      platform: body.platform,
    });
  }
}
