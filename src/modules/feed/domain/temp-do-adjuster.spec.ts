import { TempDoAdjuster } from './temp-do-adjuster';

const DO_BOUNDS = { min: 4, max: null, critical: 3 };
const TEMP_BOUNDS = { min: 26, max: 32, critical: null };

describe('TempDoAdjuster (TASK-021, F2, AC-073, R3, edge case 2)', () => {
  const adjuster = new TempDoAdjuster();

  it('no adjustment when DO and temperature are both within the safe band', () => {
    const result = adjuster.adjust({
      baseKg: 10,
      latestDo: 5,
      latestTemp: 28,
      doBounds: DO_BOUNDS,
      tempBounds: TEMP_BOUNDS,
    });
    expect(result).toEqual({ adjustedKg: 10, adjusted: false, reason: null });
  });

  it('edge case 2: DO below critical skips feeding outright (quota 0) with an explicit reason', () => {
    const result = adjuster.adjust({
      baseKg: 10,
      latestDo: 2,
      latestTemp: 28,
      doBounds: DO_BOUNDS,
      tempBounds: TEMP_BOUNDS,
    });
    expect(result.adjustedKg).toBe(0);
    expect(result.adjusted).toBe(true);
    expect(result.reason).toMatch(/dissolved oxygen/i);
  });

  it('R3: DO below the low threshold (but not critical) reduces the quota with a reason', () => {
    const result = adjuster.adjust({
      baseKg: 10,
      latestDo: 3.5,
      latestTemp: 28,
      doBounds: DO_BOUNDS,
      tempBounds: TEMP_BOUNDS,
    });
    expect(result.adjustedKg).toBe(5);
    expect(result.adjusted).toBe(true);
    expect(result.reason).toMatch(/dissolved oxygen/i);
  });

  it('R3: temperature outside the safe band reduces the quota with a reason', () => {
    const result = adjuster.adjust({
      baseKg: 10,
      latestDo: 5,
      latestTemp: 34,
      doBounds: DO_BOUNDS,
      tempBounds: TEMP_BOUNDS,
    });
    expect(result.adjustedKg).toBe(5);
    expect(result.adjusted).toBe(true);
    expect(result.reason).toMatch(/temperature/i);
  });

  it('a critical DO skip wins over a simultaneous temperature breach', () => {
    const result = adjuster.adjust({
      baseKg: 10,
      latestDo: 2,
      latestTemp: 34,
      doBounds: DO_BOUNDS,
      tempBounds: TEMP_BOUNDS,
    });
    expect(result.adjustedKg).toBe(0);
    expect(result.reason).toMatch(/dissolved oxygen/i);
  });

  it('missing readings (never recorded for this pond) never trigger an adjustment', () => {
    const result = adjuster.adjust({
      baseKg: 10,
      latestDo: null,
      latestTemp: null,
      doBounds: DO_BOUNDS,
      tempBounds: TEMP_BOUNDS,
    });
    expect(result).toEqual({ adjustedKg: 10, adjusted: false, reason: null });
  });
});
