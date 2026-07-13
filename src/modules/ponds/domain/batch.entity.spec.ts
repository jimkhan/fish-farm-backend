import { Batch } from './batch.entity';

const baseProps = {
  id: 'b-1',
  projectId: 'p-1',
  pondId: 'pond-1',
  stockingId: 's-1',
  speciesId: 'species-1',
  initialCount: 1000,
  cumulativeMortality: 0,
  harvestedCount: 0,
  latestAvgWeightG: null,
  status: 'ACTIVE' as const,
  stockedOn: new Date('2026-01-01'),
  createdAt: new Date(),
};

describe('Batch (TASK-019, MOD-04 §4.3/F3, R4/R6)', () => {
  describe('AC-062: a fresh batch', () => {
    it('survivalEstimate equals initialCount', () => {
      const batch = Batch.reconstitute(baseProps);
      expect(batch.survivalEstimate).toBe(1000);
    });

    it('biomassGrams is null before any sampling (R6)', () => {
      const batch = Batch.reconstitute(baseProps);
      expect(batch.biomassGrams).toBeNull();
    });
  });

  describe('AC-063/R4: survivalEstimate reflects mortality', () => {
    it('subtracts cumulative mortality', () => {
      const batch = Batch.reconstitute({ ...baseProps, cumulativeMortality: 200 });
      expect(batch.survivalEstimate).toBe(800);
    });

    it('applyMortality() returns a new instance with mortality added, original untouched', () => {
      const batch = Batch.reconstitute(baseProps);
      const afterFirst = batch.applyMortality(100);
      const afterSecond = afterFirst.applyMortality(50);

      expect(afterSecond.cumulativeMortality).toBe(150);
      expect(afterSecond.survivalEstimate).toBe(850);
      expect(batch.cumulativeMortality).toBe(0); // original untouched
    });
  });

  describe('R4: survival clamps at 0 (edge case 2, data anomaly)', () => {
    it('mortality exceeding initial count clamps survival at 0, never negative', () => {
      const batch = Batch.reconstitute({ ...baseProps, cumulativeMortality: 1500 });
      expect(batch.survivalEstimate).toBe(0);
    });

    it('mortality + harvest together exceeding initial also clamps at 0', () => {
      const batch = Batch.reconstitute({
        ...baseProps,
        cumulativeMortality: 600,
        harvestedCount: 600,
      });
      expect(batch.survivalEstimate).toBe(0);
    });
  });

  describe('AC-066: sampling updates the latest weight', () => {
    it('applySampling() sets latestAvgWeightG and enables biomassGrams', () => {
      const batch = Batch.reconstitute(baseProps).applySampling(25.5);
      expect(batch.latestAvgWeightG).toBe(25.5);
      expect(batch.biomassGrams).toBe(1000 * 25.5);
    });

    it('a later sampling replaces the previous weight', () => {
      const batch = Batch.reconstitute(baseProps).applySampling(20).applySampling(30);
      expect(batch.latestAvgWeightG).toBe(30);
    });
  });

  describe('AC-067: harvest reduces survival and biomass', () => {
    it('applyHarvest() reduces survivalEstimate', () => {
      const batch = Batch.reconstitute(baseProps).applySampling(25).applyHarvest(300);
      expect(batch.survivalEstimate).toBe(700);
      expect(batch.biomassGrams).toBe(700 * 25);
    });
  });
});
