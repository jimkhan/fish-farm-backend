import { Controller, Get, Query, StreamableFile } from '@nestjs/common';
import { ValidationError } from '../../../shared-kernel/errors/domain-error';
import {
  ExportReportUseCase,
  REPORT_KINDS,
  ReportKind,
} from '../application/export-report.usecase';

/**
 * `ReportExportController` (TASK-038, CON-046, AC-123/126). Deliberately a **separate** controller
 * from `ReportingController` (the daily summary): that one is class-gated to `canAccessReports`
 * (OWNER+PARTNER), but growth/harvest exports are open to any member (R6/AC-123) — the per-`kind`
 * financial gate lives inside `ExportReportUseCase`, which is where it can actually see `kind`.
 * `ProjectScopeGuard` (global) still enforces membership, so a non-member is 403 here regardless.
 */
@Controller('projects/:projectId/reports')
export class ReportExportController {
  constructor(private readonly exportReport: ExportReportUseCase) {}

  @Get('export')
  async exportHandler(@Query('kind') kind?: string): Promise<StreamableFile> {
    if (!kind || !REPORT_KINDS.includes(kind as ReportKind)) {
      throw new ValidationError('Unknown report type.');
    }

    const file = await this.exportReport.execute(kind as ReportKind);
    // The contract declares application/octet-stream (an opaque binary stream); the .csv filename
    // + Content-Disposition tell the client it's CSV without changing the contract's media type.
    return new StreamableFile(Buffer.from(file.content, 'utf-8'), {
      type: 'application/octet-stream',
      disposition: `attachment; filename="${file.filename}"`,
    });
  }
}
