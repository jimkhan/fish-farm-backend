import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { HarvestRevenueEarned } from '@fish-farm/shared';
import { FinancialTxn } from '../domain/financial-txn.entity';
import {
  FINANCIAL_TXN_EVENT_REPOSITORY,
  FinancialTxnEventRepositoryPort,
} from './ports/financial-txn-event-repository.port';

/** R3/AC-108: `HarvestRevenueEarned` → a HARVEST revenue, idempotent by `sourceRef = Harvest.id`. */
@Injectable()
export class OnHarvestRevenueEarnedHandler {
  constructor(
    @Inject(FINANCIAL_TXN_EVENT_REPOSITORY) private readonly txns: FinancialTxnEventRepositoryPort,
  ) {}

  async handle(event: HarvestRevenueEarned): Promise<void> {
    const existing = await this.txns.findBySourceRef(event.harvestId);
    if (existing) {
      return;
    }

    await this.txns.save(
      FinancialTxn.reconstitute({
        id: randomUUID(),
        projectId: event.projectId,
        kind: 'REVENUE',
        category: 'HARVEST',
        amountMinor: event.revenueMinor,
        occurredOn: event.occurredAt,
        sourceRef: event.harvestId,
        note: null,
        createdAt: new Date(),
      }),
    );
  }
}
