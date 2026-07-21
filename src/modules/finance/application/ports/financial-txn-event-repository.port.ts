import { FinancialTxn } from '../../domain/financial-txn.entity';

/**
 * Unscoped (TASK-032) — the three auto-ingestion handlers (`StockingRecorded`/
 * `FeedCostIncurred`/`HarvestRevenueEarned`) run on `DomainEventBus` delivery, not inside an HTTP
 * request, so there is no `TenantContext` to scope through — the same structural exception as
 * `AlertEventRepositoryPort`/`BatchEventRepositoryPort` (MOD-01 §4.6). `projectId` comes from the
 * event itself, not from tenant scope.
 */
export interface FinancialTxnEventRepositoryPort {
  /** R3/AC-108/109/117: the durable idempotency check — a source ref already recorded is never re-ingested. */
  findBySourceRef(sourceRef: string): Promise<FinancialTxn | null>;
  save(txn: FinancialTxn): Promise<FinancialTxn>;
}

export const FINANCIAL_TXN_EVENT_REPOSITORY = 'FinancialTxnEventRepositoryPort';
