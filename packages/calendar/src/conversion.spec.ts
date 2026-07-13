import { toBangla, toGregorian } from './conversion';
import { InvalidBanglaDateError, InvalidInputError } from './types';

const utc = (y: number, m: number, d: number): Date => new Date(Date.UTC(y, m - 1, d));
const iso = (d: Date): string => d.toISOString().slice(0, 10);

describe('toBangla / toGregorian (TASK-007, AC-042…044, AC-048)', () => {
  describe('AC-042: Bangla year offset', () => {
    it('on/after 14 April, Bangla year = Gregorian year - 593', () => {
      expect(toBangla(utc(2026, 4, 14)).year).toBe(2026 - 593);
      expect(toBangla(utc(2026, 12, 31)).year).toBe(2026 - 593);
    });

    it('before 14 April, Bangla year = Gregorian year - 594', () => {
      expect(toBangla(utc(2026, 4, 13)).year).toBe(2026 - 594);
      expect(toBangla(utc(2026, 1, 1)).year).toBe(2026 - 594);
    });
  });

  describe('Pohela Boishakh is always 14 April (R1)', () => {
    it.each([2023, 2024, 2025, 2026, 2027])('year %i', (year) => {
      const result = toBangla(utc(year, 4, 14));
      expect(result.month).toBe(1);
      expect(result.day).toBe(1);
    });
  });

  describe('the 13→14 April boundary (edge case 2)', () => {
    it('13 Apr is Choitro 30 of the outgoing Bangla year; 14 Apr is Boishakh 1 of the next', () => {
      const day13 = toBangla(utc(2026, 4, 13));
      const day14 = toBangla(utc(2026, 4, 14));
      expect(day13).toEqual({ year: 2026 - 594, month: 12, day: 30, ritu: 'BOSONTO' });
      expect(day14).toEqual({ year: 2026 - 593, month: 1, day: 1, ritu: 'GRISHMO' });
    });
  });

  describe('AC-043: leap-year Falgun', () => {
    it('the Bangla year beginning 14 Apr 2023 has a 30-day Falgun (Feb 2024 is a Gregorian leap year)', () => {
      // Falgun 1 = 14 Feb 2024 in this Bangla year; day 30 of Falgun should still be valid.
      const falgun30 = toGregorian({ year: 2023 - 593, month: 11, day: 30 });
      expect(iso(falgun30)).toBe('2024-03-14');
      expect(toBangla(falgun30)).toEqual({ year: 2023 - 593, month: 11, day: 30, ritu: 'BOSONTO' });

      // And Pohela Boishakh still lands on 14 Apr 2024, unaffected by the extra Falgun day.
      const nextBoishakh1 = toBangla(utc(2024, 4, 14));
      expect(nextBoishakh1).toEqual({ year: 2024 - 593, month: 1, day: 1, ritu: 'GRISHMO' });
    });

    it('a non-leap-Falgun year has only 29 Falgun days — day 30 is invalid', () => {
      // The Bangla year beginning 14 Apr 2025 has Falgun in Feb 2026 (not a leap year).
      expect(() => toGregorian({ year: 2025 - 593, month: 11, day: 30 })).toThrow(
        InvalidBanglaDateError,
      );
    });
  });

  describe('AC-044: round-trip across a full year, including leap Falgun', () => {
    it('every day of a leap-Falgun Bangla year round-trips exactly', () => {
      const banglaYear = 2023 - 593; // 366-day year (leap Falgun)
      const monthLengths = [31, 31, 31, 31, 31, 31, 30, 30, 30, 30, 30, 30];
      for (let month = 1; month <= 12; month++) {
        for (let day = 1; day <= monthLengths[month - 1]; day++) {
          const bangla = { year: banglaYear, month, day };
          const gregorian = toGregorian(bangla);
          expect(toBangla(gregorian)).toEqual({ ...bangla, ritu: expect.any(String) });
        }
      }
    });

    it('every day of a non-leap-Falgun Bangla year round-trips exactly', () => {
      const banglaYear = 2025 - 593; // 365-day year
      const monthLengths = [31, 31, 31, 31, 31, 31, 30, 30, 30, 30, 29, 30];
      for (let month = 1; month <= 12; month++) {
        for (let day = 1; day <= monthLengths[month - 1]; day++) {
          const bangla = { year: banglaYear, month, day };
          const gregorian = toGregorian(bangla);
          expect(toBangla(gregorian)).toEqual({ ...bangla, ritu: expect.any(String) });
        }
      }
    });

    it('Gregorian → Bangla → Gregorian recovers the original date across a full Gregorian year', () => {
      const start = utc(2026, 1, 1);
      for (let offset = 0; offset < 365; offset++) {
        const original = new Date(start.getTime() + offset * 86_400_000);
        const roundTripped = toGregorian(toBangla(original));
        expect(iso(roundTripped)).toBe(iso(original));
      }
    });
  });

  describe('far-future / far-past dates (edge case 7)', () => {
    it.each([1900, 2000, 2100, 2200, 3000])('year %i still applies the rules with no overflow', (year) => {
      const result = toBangla(utc(year, 4, 14));
      expect(result).toEqual({ year: year - 593, month: 1, day: 1, ritu: 'GRISHMO' });
    });
  });

  describe('AC-048: invalid Bangla input throws typed errors, not a silent wrap', () => {
    it('rejects an out-of-range month', () => {
      expect(() => toGregorian({ year: 1432, month: 13, day: 1 })).toThrow(InvalidBanglaDateError);
      expect(() => toGregorian({ year: 1432, month: 0, day: 1 })).toThrow(InvalidBanglaDateError);
    });

    it('rejects day 31 in Falgun (max is 29 or 30)', () => {
      expect(() => toGregorian({ year: 1432, month: 11, day: 31 })).toThrow(InvalidBanglaDateError);
    });

    it('rejects day 0', () => {
      expect(() => toGregorian({ year: 1432, month: 1, day: 0 })).toThrow(InvalidBanglaDateError);
    });
  });

  describe('invalid Gregorian input', () => {
    it('rejects a non-Date / NaN date', () => {
      expect(() => toBangla(new Date('not-a-date'))).toThrow(InvalidInputError);
      // @ts-expect-error — deliberately wrong type to prove the runtime guard
      expect(() => toBangla('2026-01-01')).toThrow(InvalidInputError);
    });
  });
});
