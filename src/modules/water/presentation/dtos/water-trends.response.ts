import { WaterTrends } from '../../application/get-water-trends.usecase';
import { toWaterReadingResponse, WaterReadingResponse } from './water-reading.response';

/** Wire shape of the `PatternAdvisory` schema (contracts/openapi.yaml, CON-059). */
export interface PatternAdvisoryResponse {
  pattern: string;
  consecutiveDays: number;
  fromReadAt: string;
  toReadAt: string;
  dropValue: number;
}

/** Wire shape of the `WaterTrends` schema (contracts/openapi.yaml, CON-059). */
export interface WaterTrendsResponse {
  parameter: string;
  series: WaterReadingResponse[];
  advisory: PatternAdvisoryResponse | null;
}

export function toWaterTrendsResponse(trends: WaterTrends): WaterTrendsResponse {
  return {
    parameter: trends.parameter,
    series: trends.series.map(toWaterReadingResponse),
    advisory: trends.advisory
      ? {
          pattern: trends.advisory.pattern,
          consecutiveDays: trends.advisory.consecutiveDays,
          fromReadAt: trends.advisory.fromReadAt.toISOString(),
          toReadAt: trends.advisory.toReadAt.toISOString(),
          dropValue: trends.advisory.dropValue,
        }
      : null,
  };
}
