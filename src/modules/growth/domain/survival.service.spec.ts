import { calculateSurvivalRate } from './survival.service';

describe('calculateSurvivalRate (TASK-030, R4, AC-099)', () => {
  it('AC-099: survival rate = current survival ÷ initial count', () => {
    expect(calculateSurvivalRate(800, 1000)).toBe(0.8);
  });

  it('is 0 when survival is 0', () => {
    expect(calculateSurvivalRate(0, 1000)).toBe(0);
  });

  it('never divides by zero — returns 0 for a zero initial count', () => {
    expect(calculateSurvivalRate(0, 0)).toBe(0);
  });
});
