/**
 * Types for the Bangla calendar (Bangladesh-revised 2019 rules, ADR-011, MOD-11 §2.4).
 * Framework-free (CLAUDE.md invariant #6) — this file has zero imports.
 */

/** Bangla months in canonical order 1–12 (mirrors `contracts/openapi.yaml` BanglaMonth enum). */
export const BANGLA_MONTHS = [
  'BOISHAKH',
  'JOISHTHO',
  'ASHARH',
  'SRABON',
  'BHADRO',
  'ASHSHIN',
  'KARTIK',
  'OGROHAYON',
  'POUSH',
  'MAGH',
  'FALGUN',
  'CHOITRO',
] as const;

export type BanglaMonth = (typeof BANGLA_MONTHS)[number];

/** The six ritu (seasons), two months each — R5, mirrors the Ritu enum. */
export const RITUS = ['GRISHMO', 'BORSHA', 'SHAROD', 'HEMONTO', 'SHEET', 'BOSONTO'] as const;

export type Ritu = (typeof RITUS)[number];

/** A resolved Bangla calendar date. `month` is 1–12 (index into `BANGLA_MONTHS`). */
export interface BanglaDate {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly ritu: Ritu;
}

/** Bangla-date input for `toGregorian` — same shape minus the derived `ritu`. */
export interface BanglaDateInput {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

/** Thrown for a structurally invalid Bangla date (bad month/day) — never a silent wrap (R5 edge case). */
export class InvalidBanglaDateError extends Error {
  constructor(detail: string) {
    super(`Invalid Bangla date: ${detail}.`);
    this.name = 'InvalidBanglaDateError';
  }
}

/** Thrown for a non-date / NaN input to `toBangla`. */
export class InvalidInputError extends Error {
  constructor() {
    super('A valid date is required.');
    this.name = 'InvalidInputError';
  }
}
