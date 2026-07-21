import { Injectable } from '@nestjs/common';
import { ScopedRepository } from '../../../shared-kernel/tenant/scoped-repository';
import { FinancialTxn } from '../domain/financial-txn.entity';
import { FinancialTxnRepositoryPort } from '../application/ports/financial-txn-repository.port';
import { FinancialTxnPersistenceModel } from './persistence/financial-txn.persistence-model';
import { toDomain, toPersistence } from './persistence/financial-txn.mapper';

@Injectable()
export class TypeOrmFinancialTxnRepository implements FinancialTxnRepositoryPort {
  constructor(private readonly scoped: ScopedRepository<FinancialTxnPersistenceModel>) {}

  async findAllInCurrentProject(): Promise<FinancialTxn[]> {
    const models = await this.scoped.find();
    return models.map(toDomain);
  }

  async save(txn: FinancialTxn): Promise<FinancialTxn> {
    const saved = await this.scoped.save(toPersistence(txn));
    return toDomain(saved);
  }
}
