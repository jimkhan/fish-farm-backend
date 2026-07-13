import { Injectable } from '@nestjs/common';
import { AbnormalMortalityDetected } from '@fish-farm/shared';
import { RaiseAlertUseCase } from './raise-alert.usecase';

/**
 * WARNING, not CRITICAL — only `WATER_EMERGENCY` (and a severe `WATER_THRESHOLD`) are called out
 * as always-CRITICAL in the specs (R3); a mortality spike isn't singled out the same way. Owner
 * still sees it regardless of severity (R2's blanket "Owner receives all alerts").
 */
@Injectable()
export class OnAbnormalMortalityDetectedHandler {
  constructor(private readonly raiseAlert: RaiseAlertUseCase) {}

  async handle(event: AbnormalMortalityDetected): Promise<void> {
    await this.raiseAlert.execute({
      projectId: event.projectId,
      type: 'ABNORMAL_MORTALITY',
      severity: 'WARNING',
      sourceRef: event.sourceRef,
      message: event.message,
    });
  }
}
