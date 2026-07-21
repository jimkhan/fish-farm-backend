import { FinancialTxn } from '../../domain/financial-txn.entity';

/** Tenant-scoped (ADR-006) — for the online `GET/POST .../finance/transactions` endpoints. */
export interface FinancialTxnRepositoryPort {
  findAllInCurrentProject(): Promise<FinancialTxn[]>;
  save(txn: FinancialTxn): Promise<FinancialTxn>;
}

export const FINANCIAL_TXN_REPOSITORY = 'FinancialTxnRepositoryPort';
