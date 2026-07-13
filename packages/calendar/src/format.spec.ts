import { toBangla } from './conversion';
import { banglaMonthName, formatBangla, formatDual } from './format';

describe('banglaMonthName / formatBangla / formatDual (TASK-007, F3, AC-049)', () => {
  it('banglaMonthName renders the romanized display name', () => {
    expect(banglaMonthName(11)).toBe('Falgun');
    expect(banglaMonthName(1)).toBe('Boishakh');
  });

  it('rejects an out-of-range month', () => {
    expect(() => banglaMonthName(13)).toThrow(RangeError);
  });

  it('formatBangla renders day/year in Bengali numerals with the month name', () => {
    const bangla = { year: 1432, month: 11, day: 8, ritu: 'BOSONTO' as const };
    expect(formatBangla(bangla)).toBe('৮ Falgun, ১৪৩২');
  });

  it('formatBangla optionally includes the ritu', () => {
    const bangla = { year: 1432, month: 11, day: 8, ritu: 'BOSONTO' as const };
    expect(formatBangla(bangla, { includeRitu: true })).toBe('৮ Falgun, ১৪৩২ (Bosonto)');
  });

  it('formatDual combines the Gregorian ISO date with the Bangla date', () => {
    const gregorian = new Date(Date.UTC(2026, 1, 21)); // 21 Feb 2026
    const bangla = toBangla(gregorian);
    expect(formatDual(gregorian, bangla)).toBe(`2026-02-21 (${formatBangla(bangla)})`);
  });
});
