/**
 * One day in the cached 5-day strip (W-16). Aggregated from OpenWeather 3-hour forecast slots.
 */
export interface WeatherForecastDay {
  readonly date: string; // YYYY-MM-DD (Asia/Dhaka calendar day)
  readonly tempMaxC: number;
  readonly tempMinC: number;
  readonly condition: string;
  readonly popPct: number;
  readonly rainRisk: boolean;
  readonly heatRisk: boolean;
}
