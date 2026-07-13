import { Injectable } from '@nestjs/common';
import { LowStock } from '@fish-farm/shared';
import { RaiseAlertUseCase } from './raise-alert.usecase';

/** Operational, not owner-critical (R2) — WARNING. */
@Injectable()
export class OnLowStockHandler {
  constructor(private readonly raiseAlert: RaiseAlertUseCase) {}

  async handle(event: LowStock): Promise<void> {
    await this.raiseAlert.execute({
      projectId: event.projectId,
      type: 'LOW_STOCK',
      severity: 'WARNING',
      sourceRef: event.sourceRef,
      message: event.message,
    });
  }
}
