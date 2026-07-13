import { Injectable } from '@nestjs/common';
import { WaterThresholdBreached } from '@fish-farm/shared';
import { RaiseAlertUseCase } from './raise-alert.usecase';

@Injectable()
export class OnWaterThresholdBreachedHandler {
  constructor(private readonly raiseAlert: RaiseAlertUseCase) {}

  async handle(event: WaterThresholdBreached): Promise<void> {
    await this.raiseAlert.execute({
      projectId: event.projectId,
      type: 'WATER_THRESHOLD',
      severity: event.severity,
      sourceRef: event.sourceRef,
      message: event.message,
    });
  }
}
