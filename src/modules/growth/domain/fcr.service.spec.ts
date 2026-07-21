import { calculateFcr } from './fcr.service';

describe('calculateFcr (TASK-030, R3, AC-098)', () => {
  it('AC-098: FCR = total feed ÷ biomass gain', () => {
    expect(calculateFcr(150, 100)).toBe(1.5);
  });

  it('is null (never fabricated) when gain is unmeasurable (null)', () => {
    expect(calculateFcr(150, null)).toBeNull();
  });

  it('is null (never Infinity/NaN) when gain is zero or negative', () => {
    expect(calculateFcr(150, 0)).toBeNull();
    expect(calculateFcr(150, -5)).toBeNull();
  });
});
