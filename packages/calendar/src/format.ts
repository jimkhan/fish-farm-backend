import { toBengaliNumerals } from './numerals';
import { rituName } from './ritu';
import { BanglaDate, BANGLA_MONTHS } from './types';

/**
 * English display name for a Bangla month (e.g. `11` → `'Falgun'`). No Bangla-script month
 * names are specified anywhere in the source docs (BRD §7.14, GLOSSARY, contracts/openapi.yaml
 * all use the romanized form as canonical), so this package renders worker/owner-facing dates
 * with romanized month names + Bengali numerals rather than inventing unverified script
 * spellings. If authoritative Bangla-script names are supplied later, they slot in here without
 * touching the conversion math.
 */
export function banglaMonthName(month: number): string {
  const enumName = BANGLA_MONTHS[month - 1];
  if (enumName === undefined) {
    throw new RangeError(`Bangla month must be 1-12, got ${month}.`);
  }
  return enumName.charAt(0) + enumName.slice(1).toLowerCase();
}

export interface FormatOptions {
  /** Include the ritu name, e.g. "8 Falgun, ১৪৩২ (Bosonto)". Default false. */
  readonly includeRitu?: boolean;
}

/** Canonical worker-facing Bangla date string (F3). Day and year use Bengali numerals. */
export function formatBangla(date: BanglaDate, opts: FormatOptions = {}): string {
  const base = `${toBengaliNumerals(date.day)} ${banglaMonthName(date.month)}, ${toBengaliNumerals(date.year)}`;
  return opts.includeRitu ? `${base} (${rituName(date.ritu)})` : base;
}

/** Canonical owner-facing dual date: Gregorian first, Bangla in parentheses (F3). */
export function formatDual(gregorian: Date, bangla: BanglaDate): string {
  const iso = gregorian.toISOString().slice(0, 10);
  return `${iso} (${formatBangla(bangla)})`;
}
