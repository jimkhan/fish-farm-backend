/**
 * R4/AC-120: "highlights heavy rain and extreme heat (feeding/oxygen-relevant)." No spec source
 * states numeric thresholds anywhere (BACKLOG/module doc/ADR-018 all silent) — documented
 * judgment calls, same category as TASK-023's alkalinity threshold / TASK-021's BW% bands.
 */

/** Water/air temperature at which fish-farm feeding and dissolved-oxygen risk becomes acute in
 * a Bangladesh polyculture context. */
export const EXTREME_HEAT_THRESHOLD_C = 35;

export function isExtremeHeat(tempC: number): boolean {
  return tempC >= EXTREME_HEAT_THRESHOLD_C;
}

/** OpenWeather "weather condition id" codes for heavy/very-heavy/extreme rain and heavy shower
 * rain (OpenWeather's own published condition-code grouping, not a spec-sourced value — the
 * spec never names a provider-specific code, only "heavy rain" in prose). */
export const OPENWEATHER_HEAVY_RAIN_CONDITION_IDS: readonly number[] = [502, 503, 504, 522];

export function isHeavyRain(openWeatherConditionId: number): boolean {
  return OPENWEATHER_HEAVY_RAIN_CONDITION_IDS.includes(openWeatherConditionId);
}
