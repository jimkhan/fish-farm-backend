/** Bengali digit glyphs ০–৯ (R7). Per-digit mapping, not a lookup of the whole number. */
const BENGALI_DIGITS = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];

/**
 * Renders an integer with Bengali numerals (F3, AC-045): `2026 → ２০২৬`-shaped output,
 * `0 → ০`. A leading `-` is preserved as-is (no negative-numeral convention is specified).
 */
export function toBengaliNumerals(n: number): string {
  if (!Number.isInteger(n)) {
    throw new RangeError(`toBengaliNumerals requires an integer, got ${n}.`);
  }
  const sign = n < 0 ? '-' : '';
  const digits = Math.abs(n)
    .toString()
    .split('')
    .map((digit) => BENGALI_DIGITS[Number(digit)])
    .join('');
  return sign + digits;
}
