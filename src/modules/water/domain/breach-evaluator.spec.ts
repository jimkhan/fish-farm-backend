import { BreachEvaluator } from './breach-evaluator';

describe('BreachEvaluator (TASK-023, F2/R2/R3, AC-084/085/092)', () => {
  const evaluator = new BreachEvaluator();

  describe('min-only (e.g. DO, alkalinity)', () => {
    const bounds = { min: 4, max: null, critical: 3 };

    it('no breach within range', () => {
      expect(evaluator.evaluate(5, bounds)).toBeNull();
      expect(evaluator.evaluate(4, bounds)).toBeNull();
    });

    it('WARNING below min but at/above critical', () => {
      expect(evaluator.evaluate(3.5, bounds)).toBe('WARNING');
      expect(evaluator.evaluate(3, bounds)).toBe('WARNING');
    });

    it('CRITICAL below the critical bound', () => {
      expect(evaluator.evaluate(2.5, bounds)).toBe('CRITICAL');
    });

    it('AC-092-analog: a high value never breaches a min-only parameter', () => {
      expect(evaluator.evaluate(999, bounds)).toBeNull();
    });
  });

  describe('max-only (e.g. ammonia, nitrite)', () => {
    const bounds = { min: null, max: 0.1, critical: null };

    it('no breach within range', () => {
      expect(evaluator.evaluate(0.05, bounds)).toBeNull();
      expect(evaluator.evaluate(0.1, bounds)).toBeNull();
    });

    it('AC-092: WARNING when exceeding max', () => {
      expect(evaluator.evaluate(0.15, bounds)).toBe('WARNING');
    });

    it('AC-092: a low value never breaches a max-only parameter', () => {
      expect(evaluator.evaluate(0, bounds)).toBeNull();
      expect(evaluator.evaluate(-5, bounds)).toBeNull();
    });

    it('CRITICAL when a critical bound is also configured and exceeded', () => {
      const withCritical = { min: null, max: 0.1, critical: 0.3 };
      expect(evaluator.evaluate(0.2, withCritical)).toBe('WARNING');
      expect(evaluator.evaluate(0.35, withCritical)).toBe('CRITICAL');
    });
  });

  describe('range (e.g. pH, temp, Secchi)', () => {
    const bounds = { min: 7.0, max: 8.5, critical: null };

    it('no breach within range', () => {
      expect(evaluator.evaluate(7.5, bounds)).toBeNull();
      expect(evaluator.evaluate(7.0, bounds)).toBeNull();
      expect(evaluator.evaluate(8.5, bounds)).toBeNull();
    });

    it('WARNING below min', () => {
      expect(evaluator.evaluate(6.5, bounds)).toBe('WARNING');
    });

    it('WARNING above max', () => {
      expect(evaluator.evaluate(9.0, bounds)).toBe('WARNING');
    });
  });

  describe('no threshold configured at all', () => {
    it('never breaches', () => {
      expect(evaluator.evaluate(999, { min: null, max: null, critical: null })).toBeNull();
    });
  });
});
