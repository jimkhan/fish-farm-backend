/**
 * BDT display formatting (ADR-018): integer minor units (poisha) in, a South-Asian
 * lakh/crore-grouped, Bengali-numeral, ৳-prefixed string out. Storage stays untouched — this is
 * display-only, never used for arithmetic or persistence.
 */

// Duplicated (not imported from @fish-farm/calendar) — a single fixed digit-glyph mapping isn't
// worth a cross-package dependency between two independently publishable packages.
const BENGALI_DIGITS = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];

/** Rightmost 3 digits, then groups of 2 (e.g. `1234567` → `12,34,567`) — the lakh/crore rule. */
function groupSouthAsian(absoluteDigits: string): string {
  if (absoluteDigits.length <= 3) {
    return absoluteDigits;
  }
  const last3 = absoluteDigits.slice(-3);
  let rest = absoluteDigits.slice(0, -3);
  const groups: string[] = [];
  while (rest.length > 2) {
    groups.unshift(rest.slice(-2));
    rest = rest.slice(0, -2);
  }
  if (rest.length > 0) {
    groups.unshift(rest);
  }
  return [...groups, last3].join(',');
}

/**
 * `amountMinor` (poisha) → `৳১,২৩,৪৫৬`-shaped BDT string. Whole taka only — ADR-018's own
 * example (`১,২৩,৪৫৬`) shows no decimal places, and recorded amounts are practically always
 * whole taka; poisha precision isn't displayed.
 */
export function formatBdt(amountMinor: number): string {
  const wholeTaka = Math.round(amountMinor / 100);
  const sign = wholeTaka < 0 ? '-' : '';
  const grouped = groupSouthAsian(Math.abs(wholeTaka).toString());
  const bengaliDigits = grouped
    .split('')
    .map((char) => (char === ',' ? ',' : BENGALI_DIGITS[Number(char)]))
    .join('');
  return `${sign}৳${bengaliDigits}`;
}
