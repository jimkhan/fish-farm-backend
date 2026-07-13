import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DeliveryAttempt } from '../domain/delivery-attempt.entity';
import { DeliveryAttemptRepositoryPort } from '../application/ports/delivery-attempt-repository.port';
import { toDomain, toPersistence } from './persistence/delivery-attempt.mapper';
import { DeliveryAttemptPersistenceModel } from './persistence/delivery-attempt.persistence-model';

/** Unscoped by project — see `DeliveryAttemptRepositoryPort`'s doc comment. */
@Injectable()
export class TypeOrmDeliveryAttemptRepository implements DeliveryAttemptRepositoryPort {
  constructor(
    @InjectRepository(DeliveryAttemptPersistenceModel)
    private readonly repository: Repository<DeliveryAttemptPersistenceModel>,
  ) {}

  async save(attempt: DeliveryAttempt): Promise<DeliveryAttempt> {
    const saved = await this.repository.save(toPersistence(attempt));
    return toDomain(saved);
  }
}
