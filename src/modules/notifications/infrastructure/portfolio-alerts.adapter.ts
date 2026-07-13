import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';
import { PortfolioAlertsPort } from '../../projects/domain/portfolio-alerts.port';
import { AlertPersistenceModel } from './persistence/alert.persistence-model';

/**
 * TASK-012 implementation of MOD-03's `PortfolioAlertsPort`. Unscoped, by explicit `projectId`
 * (like `TypeOrmAlertEventRepository`) — the portfolio use-case aggregates across MULTIPLE
 * projects in one request, so there is no single `TenantContext` to scope through. "Open" means
 * not yet `RESOLVED` (`Alert.isActive`) — an `ACKNOWLEDGED` critical alert is still open until
 * actually resolved.
 */
@Injectable()
export class PortfolioAlertsAdapter implements PortfolioAlertsPort {
  constructor(
    @InjectRepository(AlertPersistenceModel)
    private readonly repository: Repository<AlertPersistenceModel>,
  ) {}

  async countOpenCritical(projectId: string): Promise<number> {
    return this.repository.count({
      where: { projectId, severity: 'CRITICAL', state: Not('RESOLVED') },
    });
  }
}
