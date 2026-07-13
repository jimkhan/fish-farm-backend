import { CALENDAR_ANCHORS } from './anchors';
import { toBangla, toGregorian } from './conversion';

/**
 * The required anchor suite (MOD-11 F6, AC-041). A non-leap-Falgun reference year: Bangla year
 * beginning 14 Apr 2025 has its Falgun in Feb 2026 (not a leap year), so this exercises the
 * 29-day Falgun path; `conversion.spec.ts` separately covers the leap-Falgun (30-day) path.
 */
describe('Calendar anchors (TASK-007, AC-041)', () => {
  const REFERENCE_BOISHAKH1_YEAR = 2025; // Falgun of this Bangla year falls in Feb 2026 (non-leap)

  it.each(CALENDAR_ANCHORS)(
    '$label: $gregorian.month/$gregorian.day → $bangla.month/$bangla.day',
    ({ gregorian, bangla }) => {
      // Anchors after 14 Apr fall in the SAME Boishakh-1 year; before 14 Apr, the NEXT one
      // (e.g. 21 Feb belongs to the Bangla year that began the previous 14 April).
      const isAfterBoishakh1 = gregorian.month > 4 || (gregorian.month === 4 && gregorian.day >= 14);
      const gregorianYear = isAfterBoishakh1
        ? REFERENCE_BOISHAKH1_YEAR
        : REFERENCE_BOISHAKH1_YEAR + 1;

      const date = new Date(Date.UTC(gregorianYear, gregorian.month - 1, gregorian.day));
      const result = toBangla(date);

      expect(result.month).toBe(bangla.month);
      expect(result.day).toBe(bangla.day);
    },
  );

  it('round-trips every anchor back to its exact Gregorian date', () => {
    for (const { gregorian } of CALENDAR_ANCHORS) {
      const isAfterBoishakh1 = gregorian.month > 4 || (gregorian.month === 4 && gregorian.day >= 14);
      const gregorianYear = isAfterBoishakh1
        ? REFERENCE_BOISHAKH1_YEAR
        : REFERENCE_BOISHAKH1_YEAR + 1;
      const original = new Date(Date.UTC(gregorianYear, gregorian.month - 1, gregorian.day));

      const bangla_ = toBangla(original);
      const roundTripped = toGregorian(bangla_);

      expect(roundTripped.toISOString().slice(0, 10)).toBe(original.toISOString().slice(0, 10));
    }
  });
});
