import { FinancialTxn } from '../../domain/financial-txn.entity';

/** Wire shape of the `FinancialTxn` schema (contracts/openapi.yaml, CON-032/033). */
export interface FinancialTxnResponse {
  id: string;
  projectId: string;
  kind: string;
  category: string;
  amount: { amountMinor: number; currency: 'BDT' };
  occurredOn: string;
  sourceRef: string | null;
  note: string | null;
}

export function toFinancialTxnResponse(txn: FinancialTxn): FinancialTxnResponse {
  return {
    id: txn.id,
    projectId: txn.projectId,
    kind: txn.kind,
    category: txn.category,
    amount: { amountMinor: txn.amountMinor, currency: 'BDT' },
    occurredOn: txn.occurredOn.toISOString().slice(0, 10),
    sourceRef: txn.sourceRef,
    note: txn.note,
  };
}
