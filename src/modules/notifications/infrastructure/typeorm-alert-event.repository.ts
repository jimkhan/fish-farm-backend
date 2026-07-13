import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, LessThan, Not, Repository } from 'typeorm';
import { Alert } from '../domain/alert.entity';
import { AlertEventRepositoryPort } from '../application/ports/alert-event-repository.port';
import { toDomain, toPersistence } from './persistence/alert.mapper';
import { AlertPersistenceModel } from './persistence/alert.persistence-model';

/** Unscoped — see `AlertEventRepositoryPort`'s doc comment for why (no `TenantContext` on the event bus). */
@Injectable()
export class TypeOrmAlertEventRepository implements AlertEventRepositoryPort {
  constructor(
    @InjectRepository(AlertPersistenceModel)
    private readonly repository: Repository<AlertPersistenceModel>,
  ) {}

  async findActiveByDedupKey(projectId: string, dedupKey: string): Promise<Alert | null> {
    const model = await this.repository.findOne({
      where: { projectId, dedupKey, state: Not('RESOLVED') },
    });
    return model ? toDomain(model) : null;
  }

  async findById(alertId: string): Promise<Alert | null> {
    const model = await this.repository.findOne({ where: { id: alertId } });
    return model ? toDomain(model) : null;
  }

  async findCriticalUnacknowledgedPastSla(threshold: Date): Promise<Alert[]> {
    const models = await this.repository.find({
      where: {
        severity: 'CRITICAL',
        state: Not(In(['ACKNOWLEDGED', 'RESOLVED'])),
        raisedAt: LessThan(threshold),
        escalatedAt: IsNull(),
      },
    });
    return models.map(toDomain);
  }

  async save(alert: Alert): Promise<Alert> {
    const saved = await this.repository.save(toPersistence(alert));
    return toDomain(saved);
  }
}
