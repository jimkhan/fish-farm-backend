import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { StockingRecorded } from '@fish-farm/shared';
import { FinancialTxn } from '../domain/financial-txn.entity';
import {
  FINANCIAL_TXN_EVENT_REPOSITORY,
  FinancialTxnEventRepositoryPort,
} from './ports/financial-txn-event-repository.port';

/**
 * R3/AC-109: `StockingRecorded` → a STOCKING cost, idempotent by `sourceRef = stockingId`.
 * `stockingCostMinor` is optional on the event (a stocking recorded with no cost has nothing to
 * ingest) — skips silently in that case, not an error.
 */
@Injectable()
export class OnStockingRecordedHandler {
  constructor(
    @Inject(FINANCIAL_TXN_EVENT_REPOSITORY) private readonly txns: FinancialTxnEventRepositoryPort,
  ) {}

  async handle(event: StockingRecorded): Promise<void> {
    if (event.stockingCostMinor === undefined) {
      return;
    }

    const existing = await this.txns.findBySourceRef(event.stockingId);
    if (existing) {
      return;
    }

    await this.txns.save(
      FinancialTxn.reconstitute({
        id: randomUUID(),
        projectId: event.projectId,
        kind: 'COST',
        category: 'STOCKING',
        amountMinor: event.stockingCostMinor,
        occurredOn: event.occurredAt,
        sourceRef: event.stockingId,
        note: null,
        createdAt: new Date(),
      }),
    );
  }
}
