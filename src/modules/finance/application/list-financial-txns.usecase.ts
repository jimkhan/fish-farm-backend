import { Inject, Injectable } from '@nestjs/common';
import { FinancialTxn } from '../domain/financial-txn.entity';
import {
  FINANCIAL_TXN_REPOSITORY,
  FinancialTxnRepositoryPort,
} from './ports/financial-txn-repository.port';

/** `GET /projects/{projectId}/finance/transactions` (CON-032, AC-115). OWNER + PARTNER (read-only); hidden from WORKER. */
@Injectable()
export class ListFinancialTxnsUseCase {
  constructor(@Inject(FINANCIAL_TXN_REPOSITORY) private readonly txns: FinancialTxnRepositoryPort) {}

  async execute(): Promise<FinancialTxn[]> {
    return this.txns.findAllInCurrentProject();
  }
}
