import { toCsv } from './csv';

describe('toCsv (RFC-4180)', () => {
  it('renders a header and rows joined by CRLF with a trailing newline', () => {
    expect(toCsv(['a', 'b'], [['1', '2']])).toBe('a,b\r\n1,2\r\n');
  });

  it('quotes fields containing a comma — e.g. a dual date', () => {
    const out = toCsv(['Date'], [['2026-07-20 (৫ Srabon, ১৪৩৩)']]);
    expect(out).toBe('Date\r\n"2026-07-20 (৫ Srabon, ১৪৩৩)"\r\n');
  });

  it('doubles embedded quotes and quotes fields with newlines', () => {
    expect(toCsv(['x'], [['he said "hi"']])).toBe('x\r\n"he said ""hi"""\r\n');
    expect(toCsv(['x'], [['line1\nline2']])).toBe('x\r\n"line1\nline2"\r\n');
  });

  it('renders null/undefined as empty and numbers as-is', () => {
    expect(toCsv(['a', 'b', 'c'], [[null, undefined, 42]])).toBe('a,b,c\r\n,,42\r\n');
  });
});
