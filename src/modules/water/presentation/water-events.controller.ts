import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { rolesWithCapability } from '../../identity/domain/role-capability-matrix';
import { Roles } from '../../identity/presentation/roles.decorator';
import { RolesGuard } from '../../identity/presentation/roles.guard';
import { RaiseEmergencyUseCase } from '../application/raise-emergency.usecase';
import { CreateWaterEventDto } from './dtos/create-water-event.dto';
import { WaterEventAlertResponse, toWaterEventAlertResponse } from './dtos/water-event-alert.response';

/**
 * `WaterEventsController` (TASK-024, CON-028, AC-086). One-tap emergency, gated the same as
 * readings (`canWrite` — Worker mobile raises it, module doc §2.3; Partners are read-only
 * everywhere). `202 Accepted` per the contract (the alert is genuinely delivered synchronously
 * by the time this responds, since `DomainEventBus.publish()` awaits every handler — 202 is
 * simply what the contract specifies, not a hint that delivery is still pending).
 */
@Controller('projects/:projectId/water-events')
@UseGuards(RolesGuard)
@Roles(rolesWithCapability('canWrite'), 'Partners have read-only access.')
export class WaterEventsController {
  constructor(private readonly raiseEmergency: RaiseEmergencyUseCase) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  async raiseHandler(@Body() body: CreateWaterEventDto): Promise<WaterEventAlertResponse> {
    const alert = await this.raiseEmergency.execute({ pondId: body.pondId, note: body.note });
    return toWaterEventAlertResponse(alert);
  }
}
