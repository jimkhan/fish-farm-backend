import { Injectable } from '@nestjs/common';
import { WaterEmergencyRaised } from '@fish-farm/shared';
import { RaiseAlertUseCase } from './raise-alert.usecase';

/** Always CRITICAL (R3) — hardcoded here, the source event carries no severity field. */
@Injectable()
export class OnWaterEmergencyRaisedHandler {
  constructor(private readonly raiseAlert: RaiseAlertUseCase) {}

  async handle(event: WaterEmergencyRaised): Promise<void> {
    await this.raiseAlert.execute({
      projectId: event.projectId,
      type: 'WATER_EMERGENCY',
      severity: 'CRITICAL',
      sourceRef: event.sourceRef,
      message: event.message,
    });
  }
}
