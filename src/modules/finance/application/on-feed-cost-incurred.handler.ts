import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { FeedCostIncurred } from '@fish-farm/shared';
import { FinancialTxn } from '../domain/financial-txn.entity';
import {
  FINANCIAL_TXN_EVENT_REPOSITORY,
  FinancialTxnEventRepositoryPort,
} from './ports/financial-txn-event-repository.port';

/** R3/AC-109: `FeedCostIncurred` (an inventory receipt) → a FEED cost, idempotent by `sourceRef = InventoryTxn.id`. */
@Injectable()
export class OnFeedCostIncurredHandler {
  constructor(
    @Inject(FINANCIAL_TXN_EVENT_REPOSITORY) private readonly txns: FinancialTxnEventRepositoryPort,
  ) {}

  async handle(event: FeedCostIncurred): Promise<void> {
    const existing = await this.txns.findBySourceRef(event.sourceRef);
    if (existing) {
      return;
    }

    await this.txns.save(
      FinancialTxn.reconstitute({
        id: randomUUID(),
        projectId: event.projectId,
        kind: 'COST',
        category: 'FEED',
        amountMinor: event.costMinor,
        occurredOn: event.occurredAt,
        sourceRef: event.sourceRef,
        note: null,
        createdAt: new Date(),
      }),
    );
  }
}
