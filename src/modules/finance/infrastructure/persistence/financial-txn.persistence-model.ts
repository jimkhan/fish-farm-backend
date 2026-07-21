import { Column, Entity, Index } from 'typeorm';
import { BaseProjectOwnedPersistenceModel } from '../../../../platform/persistence/base-project-owned.persistence-model';
import { FinancialCategory, FinancialKind } from '../../domain/category.vo';

/** `financial_txn` table (TASK-032, ERD `FINANCIAL_TXN`). Project-owned (R7/NFR-011). */
@Entity('financial_txn')
export class FinancialTxnPersistenceModel extends BaseProjectOwnedPersistenceModel {
  @Column('varchar')
  kind!: FinancialKind;

  @Column('varchar')
  category!: FinancialCategory;

  @Column('int', { name: 'amount_minor' })
  amountMinor!: number;

  @Column('date', { name: 'occurred_on' })
  occurredOn!: Date;

  @Index({ unique: true })
  @Column('varchar', { name: 'source_ref', nullable: true })
  sourceRef!: string | null;

  @Column('varchar', { nullable: true })
  note!: string | null;

  @Column('timestamptz', { name: 'created_at', default: () => 'now()' })
  createdAt!: Date;
}
