import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FinancialTxn } from '../domain/financial-txn.entity';
import { FinancialTxnEventRepositoryPort } from '../application/ports/financial-txn-event-repository.port';
import { FinancialTxnPersistenceModel } from './persistence/financial-txn.persistence-model';
import { toDomain, toPersistence } from './persistence/financial-txn.mapper';

/** Unscoped (global) — see `FinancialTxnEventRepositoryPort`'s doc comment. */
@Injectable()
export class TypeOrmFinancialTxnEventRepository implements FinancialTxnEventRepositoryPort {
  constructor(
    @InjectRepository(FinancialTxnPersistenceModel)
    private readonly repository: Repository<FinancialTxnPersistenceModel>,
  ) {}

  async findBySourceRef(sourceRef: string): Promise<FinancialTxn | null> {
    const model = await this.repository.findOne({ where: { sourceRef } });
    return model ? toDomain(model) : null;
  }

  async save(txn: FinancialTxn): Promise<FinancialTxn> {
    const saved = await this.repository.save(toPersistence(txn));
    return toDomain(saved);
  }
}
