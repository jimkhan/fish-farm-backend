import { Controller, Get, UseGuards } from '@nestjs/common';
import { rolesWithCapability } from '../../identity/domain/role-capability-matrix';
import { Roles } from '../../identity/presentation/roles.decorator';
import { RolesGuard } from '../../identity/presentation/roles.guard';
import { GetFinanceSummaryUseCase } from '../application/get-finance-summary.usecase';
import { FinanceSummaryResponse, toFinanceSummaryResponse } from './dtos/finance-summary.response';

/** `FinanceSummaryController` (TASK-033, CON-034, F2/F3, AC-110/111). OWNER + PARTNER (read-only); hidden from WORKER — same gate as the transaction list. */
@Controller('projects/:projectId/finance/summary')
@UseGuards(RolesGuard)
@Roles(rolesWithCapability('canAccessFinanceSettings'), 'Finance is not available for your role.')
export class FinanceSummaryController {
  constructor(private readonly getSummary: GetFinanceSummaryUseCase) {}

  @Get()
  async summaryHandler(): Promise<FinanceSummaryResponse> {
    const result = await this.getSummary.execute();
    return toFinanceSummaryResponse(result);
  }
}
