import { Body, Controller, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import { Public } from '../../../shared-kernel/auth/public.decorator';
import { IngestSensorUseCase } from '../application/ingest-sensor.usecase';
import { DeviceAuthedRequest, DeviceKeyGuard } from './device-key.guard';
import { SensorReadingDto } from './dtos/sensor-reading.dto';

/**
 * `SensorIngestionController` (TASK-027, CON-044, AC-089). `POST /devices/{deviceId}/readings` —
 * note **no `:projectId`**, so the global `ProjectScopeGuard` passes it through (same shape as
 * `/sync`); `DeviceKeyGuard` provides its own device-key auth and sets tenant scope from the
 * device row. `pondId`/`deviceId` come from that resolved device (`request.device`), never the
 * client. Returns `202 Accepted` (fire-and-forget telemetry), per the contract.
 */
// `@Public()` exempts this route from the global `AuthenticatedGuard` — it authenticates by
// device key (`security: [{ deviceKey: [] }]` in the contract), not by a user bearer token.
// Global guards run before controller-scoped ones, so without this `DeviceKeyGuard` would
// never be reached.
@Public()
@Controller('devices/:deviceId/readings')
@UseGuards(DeviceKeyGuard)
export class SensorIngestionController {
  constructor(private readonly ingest: IngestSensorUseCase) {}

  @Post()
  @HttpCode(202)
  async ingestHandler(
    @Req() request: DeviceAuthedRequest,
    @Body() body: SensorReadingDto,
  ): Promise<void> {
    // `DeviceKeyGuard` guarantees `request.device` is set before the handler runs.
    const device = request.device!;
    await this.ingest.execute({
      pondId: device.pondId,
      deviceId: device.id,
      parameter: body.parameter,
      value: body.value,
      readAt: new Date(body.readAt),
    });
  }
}
