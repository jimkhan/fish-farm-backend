import { Injectable } from '@nestjs/common';
import { MissedTask } from '@fish-farm/shared';
import { RaiseAlertUseCase } from './raise-alert.usecase';

/** Operational, not owner-critical (R2) — WARNING. */
@Injectable()
export class OnMissedTaskHandler {
  constructor(private readonly raiseAlert: RaiseAlertUseCase) {}

  async handle(event: MissedTask): Promise<void> {
    await this.raiseAlert.execute({
      projectId: event.projectId,
      type: 'MISSED_TASK',
      severity: 'WARNING',
      sourceRef: event.sourceRef,
      message: event.message,
    });
  }
}
