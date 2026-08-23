import { windDirFromDeg, windMsToKmh } from './wind.util';

describe('wind.util', () => {
  it('maps degrees to compass octants', () => {
    expect(windDirFromDeg(0)).toBe('N');
    expect(windDirFromDeg(45)).toBe('NE');
    expect(windDirFromDeg(225)).toBe('SW');
    expect(windDirFromDeg(undefined)).toBeNull();
  });

  it('converts m/s to km/h', () => {
    expect(windMsToKmh(5)).toBe(18);
    expect(windMsToKmh(undefined)).toBeNull();
  });
});
