import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { NotFoundError, ValidationError } from '../../../shared-kernel/errors/domain-error';
import { TenantContext } from '../../../shared-kernel/tenant/tenant-context';
import {
  PROJECT_REPOSITORY,
  ProjectRepositoryPort,
} from '../../projects/application/ports/project-repository.port';
import { ProjectClosedError } from '../../projects/domain/project-errors';
import { FinancialCategory, FinancialKind, isValidKindCategory } from '../domain/category.vo';
import { FinancialTxn } from '../domain/financial-txn.entity';
import {
  FINANCIAL_TXN_REPOSITORY,
  FinancialTxnRepositoryPort,
} from './ports/financial-txn-repository.port';

export interface RecordFinancialTxnInput {
  readonly kind: FinancialKind;
  readonly category: FinancialCategory;
  readonly amountMinor: number;
  readonly occurredOn: Date;
  readonly sourceRef?: string;
  readonly note?: string;
}

/**
 * `POST /projects/{projectId}/finance/transactions` (CON-033, F1, AC-107/116, R1/R2/R9). Owner
 * only (`canManageFinance`) — a manual cost/revenue entry; auto-ingested transactions go through
 * the three event handlers instead, never this use-case (module doc §2.3, "Owner (web): record
 * costs"). No `clientMutationId`/idempotency here — a manual entry is a deliberate one-off Owner
 * action, not a replay-prone offline mutation (same category as `RecordTreatmentUseCase`).
 */
@Injectable()
export class RecordFinancialTxnUseCase {
  constructor(
    @Inject(FINANCIAL_TXN_REPOSITORY) private readonly txns: FinancialTxnRepositoryPort,
    @Inject(PROJECT_REPOSITORY) private readonly projects: ProjectRepositoryPort,
    private readonly tenant: TenantContext,
  ) {}

  async execute(input: RecordFinancialTxnInput): Promise<FinancialTxn> {
    const project = await this.projects.findById(this.tenant.projectId);
    if (!project) {
      throw new NotFoundError('Project not found.');
    }
    if (project.isClosed) {
      throw new ProjectClosedError();
    }
    if (input.amountMinor <= 0 || !isValidKindCategory(input.kind, input.category)) {
      throw new ValidationError('Invalid amount or category.');
    }

    const txn = FinancialTxn.reconstitute({
      id: randomUUID(),
      projectId: this.tenant.projectId,
      kind: input.kind,
      category: input.category,
      amountMinor: input.amountMinor,
      occurredOn: input.occurredOn,
      sourceRef: input.sourceRef ?? null,
      note: input.note ?? null,
      createdAt: new Date(),
    });
    return this.txns.save(txn);
  }
}
