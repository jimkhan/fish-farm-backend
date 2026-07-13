import { BanglaDate, RITUS, Ritu } from './types';

/**
 * Ritu resolution and the seasonal-advisory hook registry (MOD-11 F4, "ritu-advisories"
 * sub-module). Two Bangla months per ritu, in month order (R5):
 * Grishmo(1–2) · Borsha(3–4) · Sharod(5–6) · Hemonto(7–8) · Sheet(9–10) · Bosonto(11–12).
 *
 * Deliberately independent of `conversion.ts` (no import either way) — `getAdvisories(date)`,
 * which needs both a Gregorian→Bangla conversion and this registry, is composed in `index.ts`.
 */
const RITU_BY_MONTH: readonly Ritu[] = [
  'GRISHMO',
  'GRISHMO',
  'BORSHA',
  'BORSHA',
  'SHAROD',
  'SHAROD',
  'HEMONTO',
  'HEMONTO',
  'SHEET',
  'SHEET',
  'BOSONTO',
  'BOSONTO',
];

/** Resolves the ritu for a Bangla month number (1–12) or a full `BanglaDate`. */
export function getRitu(monthOrDate: number | Pick<BanglaDate, 'month'>): Ritu {
  const month = typeof monthOrDate === 'number' ? monthOrDate : monthOrDate.month;
  const ritu = RITU_BY_MONTH[month - 1];
  if (ritu === undefined) {
    throw new RangeError(`Bangla month must be 1-12, got ${month}.`);
  }
  return ritu;
}

/**
 * English label for a ritu (e.g. `'BORSHA'` → `'Borsha'`). No Bangla-script ritu names are
 * specified anywhere in the source docs (BRD/GLOSSARY use the romanized form as canonical) —
 * see the note in `format.ts` for the same decision applied to month names.
 */
export function rituName(ritu: Ritu): string {
  return ritu.charAt(0) + ritu.slice(1).toLowerCase();
}

export interface SeasonalAdvisory {
  readonly source: string;
  readonly message: string;
}

const registry = new Map<Ritu, SeasonalAdvisory[]>();

/**
 * Registers a seasonal-advisory hook for a ritu (F4). Content is authored by consuming modules
 * (MOD-05/06, e.g. monsoon oxygen-risk guidance in Borsha) — this package only stores and
 * returns it (MOD-11 non-goal, §6.2).
 */
export function registerSeasonalAdvisory(ritu: Ritu, advisory: SeasonalAdvisory): void {
  if (!RITUS.includes(ritu)) {
    throw new Error(`Unknown ritu: ${String(ritu)}.`);
  }
  const existing = registry.get(ritu) ?? [];
  existing.push(advisory);
  registry.set(ritu, existing);
}

/** Advisories registered for `ritu` (or an empty array). */
export function getAdvisoriesForRitu(ritu: Ritu): readonly SeasonalAdvisory[] {
  return registry.get(ritu) ?? [];
}

/** Clears all registered advisories. Test-only utility (not part of the public barrel export). */
export function __resetAdvisoryRegistry(): void {
  registry.clear();
}
