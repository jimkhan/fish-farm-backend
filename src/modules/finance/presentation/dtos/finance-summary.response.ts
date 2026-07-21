import { FinanceSummaryResult } from '../../application/get-finance-summary.usecase';

/** Wire shape of the `FinanceSummary` schema (contracts/openapi.yaml, CON-034). */
export interface FinanceSummaryResponse {
  totalCost: { amountMinor: number; currency: 'BDT' };
  totalRevenue: { amountMinor: number; currency: 'BDT' };
  netProfit: { amountMinor: number; currency: 'BDT' };
  projectedRoiPct: number;
  remainingHarvestValue: { amountMinor: number; currency: 'BDT' };
}

export function toFinanceSummaryResponse(result: FinanceSummaryResult): FinanceSummaryResponse {
  return {
    totalCost: { amountMinor: result.totalCostMinor, currency: 'BDT' },
    totalRevenue: { amountMinor: result.totalRevenueMinor, currency: 'BDT' },
    netProfit: { amountMinor: result.netProfitMinor, currency: 'BDT' },
    projectedRoiPct: result.projectedRoiPct,
    remainingHarvestValue: { amountMinor: result.remainingHarvestValueMinor, currency: 'BDT' },
  };
}
