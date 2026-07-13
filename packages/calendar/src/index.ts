/**
 * @fish-farm/calendar — the ONE Bangla-calendar implementation (ADR-011, NFR-016,
 * CLAUDE.md invariant #6: never `Intl`/ICU, which implements the wrong — sidereal — calendar).
 * Bangladesh-revised (2019) rules. Pure, framework-free, deterministic (R8).
 */
export * from './anchors';
export { toBangla, toGregorian } from './conversion';
export { formatBangla, formatDual, banglaMonthName, FormatOptions } from './format';
export { toBengaliNumerals } from './numerals';
export {
  getAdvisoriesForRitu,
  getRitu,
  registerSeasonalAdvisory,
  rituName,
  SeasonalAdvisory,
} from './ritu';
export * from './types';

import { toBangla } from './conversion';
import { getAdvisoriesForRitu, getRitu, SeasonalAdvisory } from './ritu';

/**
 * Advisories registered for the ritu governing `date` (F4). Composed here — rather than in
 * `ritu.ts` — so `ritu.ts` and `conversion.ts` stay independent of each other.
 */
export function getAdvisories(date: Date): readonly SeasonalAdvisory[] {
  return getAdvisoriesForRitu(getRitu(toBangla(date).month));
}

/** Package identity marker (TASK-051 wiring smoke test). */
export const CALENDAR_PACKAGE_NAME = '@fish-farm/calendar';
