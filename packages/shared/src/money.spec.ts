import { formatBdt } from './money';

describe('formatBdt (ADR-018 — South-Asian lakh/crore grouping, Bengali numerals, ৳)', () => {
  it('formats a value under 1000 with no grouping', () => {
    expect(formatBdt(45600)).toBe('৳৪৫৬');
  });

  it('groups the first separator at 3 digits from the right, thereafter every 2', () => {
    expect(formatBdt(123456700)).toBe('৳১২,৩৪,৫৬৭');
  });

  it('handles crore-scale amounts', () => {
    expect(formatBdt(12345678900)).toBe('৳১২,৩৪,৫৬,৭৮৯');
  });

  it('renders zero as বাংলা০ with the currency symbol', () => {
    expect(formatBdt(0)).toBe('৳০');
  });

  it('prefixes a negative amount with a plain minus sign before ৳', () => {
    expect(formatBdt(-50000)).toBe('-৳৫০০');
  });

  it('rounds to whole taka, dropping poisha precision', () => {
    expect(formatBdt(150)).toBe('৳২');
    expect(formatBdt(149)).toBe('৳১');
  });
});
