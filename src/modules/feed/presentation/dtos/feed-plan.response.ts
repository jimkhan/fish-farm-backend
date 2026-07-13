import { FeedPlan } from '../../application/get-feed-plan.usecase';

/** Wire shape of the `FeedPlan` schema (contracts/openapi.yaml, CON-018a). */
export interface FeedPlanResponse {
  batchId: string;
  totalKg: number;
  adjustedForTempDo: boolean;
  adjustmentReason: string | null;
  lines: { feedType: string; kg: number }[];
}

export function toFeedPlanResponse(plan: FeedPlan): FeedPlanResponse {
  return {
    batchId: plan.batchId,
    totalKg: plan.totalKg,
    adjustedForTempDo: plan.adjustedForTempDo,
    adjustmentReason: plan.adjustmentReason,
    lines: plan.lines.map((line) => ({ feedType: line.feedType, kg: line.kg })),
  };
}
