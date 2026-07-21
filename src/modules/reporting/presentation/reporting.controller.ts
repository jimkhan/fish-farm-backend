import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { rolesWithCapability } from '../../identity/domain/role-capability-matrix';
import { Roles } from '../../identity/presentation/roles.decorator';
import { RolesGuard } from '../../identity/presentation/roles.guard';
import { GetDailySummaryUseCase } from '../application/get-daily-summary.usecase';
import { DailySummaryResponse, toDailySummaryResponse } from './dtos/daily-summary.response';

/**
 * `ReportingController` (TASK-037, CON-042, AC-122/124/125). Human-confirmed role gate:
 * `canAccessReports` (OWNER + PARTNER) — the module doc credits only Owner with "viewing the
 * daily summary" and explicitly says Worker gets "no report access"; Partner's own inclusion
 * matches the module doc's identically-shaped financial-export line ("OWNER + PARTNER for
 * financial") and the established `canAccessFinanceSettings` precedent, since nothing suggests
 * reports should be stricter than finance.
 */
@Controller('projects/:projectId/reports')
@UseGuards(RolesGuard)
@Roles(rolesWithCapability('canAccessReports'), 'Finance/reports are not available for your role.')
export class ReportingController {
  constructor(private readonly getDailySummary: GetDailySummaryUseCase) {}

  @Get('daily-summary')
  async dailySummaryHandler(@Query('date') date?: string): Promise<DailySummaryResponse> {
    // No default documented anywhere in the spec — "today" (server UTC) is the obvious,
    // documented judgment call when `date` is omitted (openapi.yaml's own query param is
    // optional, no default stated).
    const requestedDate = date ? new Date(date) : new Date();
    const result = await this.getDailySummary.execute(requestedDate);
    return toDailySummaryResponse(result);
  }
}
