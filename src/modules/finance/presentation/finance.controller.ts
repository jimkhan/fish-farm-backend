import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { rolesWithCapability } from '../../identity/domain/role-capability-matrix';
import { Roles } from '../../identity/presentation/roles.decorator';
import { RolesGuard } from '../../identity/presentation/roles.guard';
import { ListFinancialTxnsUseCase } from '../application/list-financial-txns.usecase';
import { RecordFinancialTxnUseCase } from '../application/record-financial-txn.usecase';
import { CreateFinancialTxnDto } from './dtos/create-financial-txn.dto';
import { FinancialTxnResponse, toFinancialTxnResponse } from './dtos/financial-txn.response';

/**
 * `FinanceController` (TASK-032, CON-032/033, F1/F4, AC-107/113/114/115/116). List is gated
 * `canAccessFinanceSettings` (OWNER + PARTNER read; hidden from WORKER — R6); create is gated
 * `canManageFinance` (OWNER only — R6 "Partner read-only, including financials").
 */
@Controller('projects/:projectId/finance/transactions')
@UseGuards(RolesGuard)
export class FinanceController {
  constructor(
    private readonly listTxns: ListFinancialTxnsUseCase,
    private readonly recordTxn: RecordFinancialTxnUseCase,
  ) {}

  @Get()
  @Roles(rolesWithCapability('canAccessFinanceSettings'), 'Finance is not available for your role.')
  async listHandler(): Promise<FinancialTxnResponse[]> {
    const txns = await this.listTxns.execute();
    return txns.map(toFinancialTxnResponse);
  }

  @Post()
  @Roles(rolesWithCapability('canManageFinance'), 'Partners have read-only access.')
  async createHandler(@Body() body: CreateFinancialTxnDto): Promise<FinancialTxnResponse> {
    const txn = await this.recordTxn.execute({
      kind: body.kind,
      category: body.category,
      amountMinor: body.amount.amountMinor,
      occurredOn: new Date(body.occurredOn),
      sourceRef: body.sourceRef,
      note: body.note,
    });
    return toFinancialTxnResponse(txn);
  }
}
