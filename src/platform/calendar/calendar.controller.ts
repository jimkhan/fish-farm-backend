import { Controller, Get, Query } from '@nestjs/common';
import { toBangla, BANGLA_MONTHS, BanglaMonth, formatBangla, Ritu } from '@fish-farm/calendar';
import { ValidationError } from '../../shared-kernel/errors/domain-error';

/** Wire shape of the `BanglaDate` schema (contracts/openapi.yaml). */
export interface BanglaDateResponse {
  gregorian: string;
  banglaYear: number;
  banglaMonth: BanglaMonth;
  banglaDay: number;
  ritu: Ritu;
  formattedBn: string;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * `GET /calendar/convert` (CON-041, FR-057/059/061). A thin server mirror of
 * `@fish-farm/calendar` for reports and any server-side rendering — web/mobile import the
 * package directly so behavior can never diverge (MOD-11 §1).
 *
 * No guard is registered here: the contract lists this route under the global `bearerAuth`
 * security scheme, but JWT verification doesn't exist until MOD-02 (TASK-008) registers a
 * global auth guard via `APP_GUARD` — the same pattern `ProjectScopeGuard` already uses. Once
 * that lands, this route is protected automatically; no change needed here.
 */
@Controller('calendar')
export class CalendarController {
  @Get('convert')
  convert(@Query('date') date: string): BanglaDateResponse {
    if (typeof date !== 'string' || !ISO_DATE.test(date)) {
      throw new ValidationError('date must be an ISO date string (YYYY-MM-DD).');
    }

    const gregorian = new Date(`${date}T00:00:00.000Z`);
    // `new Date` silently rolls an out-of-range day/month into the next period (e.g.
    // 2026-02-30 → 2026-03-02) instead of failing — echo the UTC components back against the
    // input to catch that instead of just checking for NaN.
    if (Number.isNaN(gregorian.getTime()) || gregorian.toISOString().slice(0, 10) !== date) {
      throw new ValidationError('date must be a valid ISO calendar date (YYYY-MM-DD).');
    }

    const bangla = toBangla(gregorian);
    return {
      gregorian: date,
      banglaYear: bangla.year,
      banglaMonth: BANGLA_MONTHS[bangla.month - 1],
      banglaDay: bangla.day,
      ritu: bangla.ritu,
      formattedBn: formatBangla(bangla),
    };
  }
}
