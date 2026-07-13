import { toBengaliNumerals } from './numerals';

describe('toBengaliNumerals (TASK-007, AC-045, R7)', () => {
  it('renders 0 as ০', () => {
    expect(toBengaliNumerals(0)).toBe('০');
  });

  it('renders 2026 as ২০২৬', () => {
    expect(toBengaliNumerals(2026)).toBe('২০২৬');
  });

  it('maps every digit per-position, not by whole-number lookup (edge case 6)', () => {
    expect(toBengaliNumerals(105)).toBe('১০৫');
    expect(toBengaliNumerals(1000)).toBe('১০০০');
  });

  it.each([
    [0, '০'],
    [1, '১'],
    [2, '২'],
    [3, '৩'],
    [4, '৪'],
    [5, '৫'],
    [6, '৬'],
    [7, '৭'],
    [8, '৮'],
    [9, '৯'],
  ])('single digit %i → %s', (n, expected) => {
    expect(toBengaliNumerals(n)).toBe(expected);
  });

  it('preserves a leading minus for negative numbers', () => {
    expect(toBengaliNumerals(-5)).toBe('-৫');
  });

  it('rejects non-integers', () => {
    expect(() => toBengaliNumerals(1.5)).toThrow(RangeError);
  });
});
