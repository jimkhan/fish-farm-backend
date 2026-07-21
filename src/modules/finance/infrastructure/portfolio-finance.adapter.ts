import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PortfolioFinancePort } from '../../projects/domain/portfolio-finance.port';
import { FinancialTxnPersistenceModel } from './persistence/financial-txn.persistence-model';

/**
 * TASK-033 implementation of MOD-03's `PortfolioFinancePort`. Unscoped, by explicit `projectId`
 * (like `PortfolioBiomassAdapter`/`PortfolioAlertsAdapter`) — the portfolio use-case aggregates
 * across MULTIPLE projects in one request, so there is no single `TenantContext` to scope
 * through. Single-currency BDT only (ADR-018) — a plain sum, no per-currency subtotals (BACKLOG's
 * own TASK-033 entry explicitly supersedes the module doc's pre-ADR-018 "per-currency subtotals"
 * language).
 */
@Injectable()
export class PortfolioFinanceAdapter implements PortfolioFinancePort {
  constructor(
    @InjectRepository(FinancialTxnPersistenceModel)
    private readonly repository: Repository<FinancialTxnPersistenceModel>,
  ) {}

  async getNetProfitMinor(projectId: string): Promise<number> {
    const models = await this.repository.find({ where: { projectId } });
    return models.reduce(
      (sum, model) => sum + (model.kind === 'REVENUE' ? model.amountMinor : -model.amountMinor),
      0,
    );
  }
}
