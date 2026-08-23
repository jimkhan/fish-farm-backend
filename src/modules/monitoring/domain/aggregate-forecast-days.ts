import { EXTREME_HEAT_THRESHOLD_C, isHeavyRain } from './weather-thresholds';
import type { WeatherForecastDay } from './weather-forecast-day';

/** Pop at/above this → "Rain risk" flag on the day strip (W-16). */
export const FORECAST_RAIN_RISK_POP = 0.6;

export interface ForecastSlot {
  readonly dt: number;
  readonly tempC: number;
  readonly tempMinC: number;
  readonly tempMaxC: number;
  readonly condition: string;
  readonly conditionId: number;
  readonly pop: number;
}

/** Asia/Dhaka calendar day for a Unix timestamp (Bangladesh farm sites). */
export function dhakaDateKey(unixSeconds: number): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Dhaka',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(unixSeconds * 1000));
}

/**
 * Collapse OpenWeather 3-hour slots into up to 5 calendar days for the W-16 strip.
 */
export function aggregateForecastDays(slots: readonly ForecastSlot[]): WeatherForecastDay[] {
  const byDay = new Map<
    string,
    {
      tempMaxC: number;
      tempMinC: number;
      pop: number;
      heavyRain: boolean;
      conditions: Map<string, number>;
    }
  >();

  for (const slot of slots) {
    const key = dhakaDateKey(slot.dt);
    const existing = byDay.get(key);
    if (!existing) {
      byDay.set(key, {
        tempMaxC: Math.max(slot.tempMaxC, slot.tempC),
        tempMinC: Math.min(slot.tempMinC, slot.tempC),
        pop: slot.pop,
        heavyRain: isHeavyRain(slot.conditionId),
        conditions: new Map([[slot.condition, 1]]),
      });
      continue;
    }
    existing.tempMaxC = Math.max(existing.tempMaxC, slot.tempMaxC, slot.tempC);
    existing.tempMinC = Math.min(existing.tempMinC, slot.tempMinC, slot.tempC);
    existing.pop = Math.max(existing.pop, slot.pop);
    existing.heavyRain = existing.heavyRain || isHeavyRain(slot.conditionId);
    existing.conditions.set(
      slot.condition,
      (existing.conditions.get(slot.condition) ?? 0) + 1,
    );
  }

  const days: WeatherForecastDay[] = [];
  for (const [date, agg] of byDay) {
    let condition = 'Clouds';
    let best = 0;
    for (const [name, count] of agg.conditions) {
      if (count > best) {
        best = count;
        condition = name;
      }
    }
    const rainRisk = agg.heavyRain || agg.pop >= FORECAST_RAIN_RISK_POP;
    const heatRisk = agg.tempMaxC >= EXTREME_HEAT_THRESHOLD_C;
    days.push({
      date,
      tempMaxC: Math.round(agg.tempMaxC * 10) / 10,
      tempMinC: Math.round(agg.tempMinC * 10) / 10,
      condition,
      popPct: Math.round(agg.pop * 100),
      rainRisk,
      heatRisk,
    });
  }

  days.sort((a, b) => a.date.localeCompare(b.date));
  return days.slice(0, 5);
}
