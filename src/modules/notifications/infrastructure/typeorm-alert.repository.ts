import { Injectable } from '@nestjs/common';
import { ScopedRepository } from '../../../shared-kernel/tenant/scoped-repository';
import { Alert } from '../domain/alert.entity';
import { AlertRepositoryPort } from '../application/ports/alert-repository.port';
import { toDomain, toPersistence } from './persistence/alert.mapper';
import { AlertPersistenceModel } from './persistence/alert.persistence-model';

@Injectable()
export class TypeOrmAlertRepository implements AlertRepositoryPort {
  constructor(private readonly scoped: ScopedRepository<AlertPersistenceModel>) {}

  async findAllInCurrentProject(): Promise<Alert[]> {
    const models = await this.scoped.find();
    return models.map(toDomain);
  }

  async findById(alertId: string): Promise<Alert | null> {
    const model = await this.scoped.findOneById(alertId);
    return model ? toDomain(model) : null;
  }

  async findByDedupKey(dedupKey: string): Promise<Alert | null> {
    const [model] = await this.scoped.find({ dedupKey });
    return model ? toDomain(model) : null;
  }

  async save(alert: Alert): Promise<Alert> {
    const saved = await this.scoped.save(toPersistence(alert));
    return toDomain(saved);
  }
}
