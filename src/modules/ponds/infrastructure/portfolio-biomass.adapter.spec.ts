import { Repository } from 'typeorm';
import { PortfolioBiomassAdapter } from './portfolio-biomass.adapter';
import { BatchPersistenceModel } from './persistence/batch.persistence-model';

function batchModel(overrides: Partial<BatchPersistenceModel> = {}): BatchPersistenceModel {
  const model = new BatchPersistenceModel();
  model.id = 'b-1';
  model.projectId = 'p-1';
  model.pondId = 'pond-1';
  model.stockingId = 's-1';
  model.speciesId = 'species-1';
  model.initialCount = 1000;
  model.cumulativeMortality = 0;
  model.harvestedCount = 0;
  model.latestAvgWeightG = 20;
  model.status = 'ACTIVE';
  model.stockedOn = new Date('2026-01-01');
  model.createdAt = new Date();
  return Object.assign(model, overrides);
}

describe('PortfolioBiomassAdapter (TASK-012, MOD-03 PortfolioBiomassPort)', () => {
  it('aggregates biomass across every batch in the given project', async () => {
    const repository = {
      find: jest.fn().mockResolvedValue([
        batchModel({ id: 'b-1', latestAvgWeightG: 20, initialCount: 1000 }),
        batchModel({ id: 'b-2', speciesId: 'species-2', latestAvgWeightG: 10, initialCount: 500 }),
      ]),
    } as unknown as jest.Mocked<Repository<BatchPersistenceModel>>;

    const adapter = new PortfolioBiomassAdapter(repository);
    const totalKg = await adapter.getTotalBiomassKg('p-1');

    expect(repository.find).toHaveBeenCalledWith({ where: { projectId: 'p-1' } });
    expect(totalKg).toBe((1000 * 20 + 500 * 10) / 1000);
  });

  it('reflects R4 survival clamping and R6 no-weight-yet via the shared mapper/service', async () => {
    const repository = {
      find: jest.fn().mockResolvedValue([
        batchModel({ cumulativeMortality: 1500, initialCount: 1000, latestAvgWeightG: 20 }), // clamps to 0
        batchModel({ id: 'b-2', speciesId: 'species-2', latestAvgWeightG: null }), // no sampling yet
      ]),
    } as unknown as jest.Mocked<Repository<BatchPersistenceModel>>;

    const adapter = new PortfolioBiomassAdapter(repository);
    expect(await adapter.getTotalBiomassKg('p-1')).toBe(0);
  });

  it('an empty project has zero biomass', async () => {
    const repository = {
      find: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<Repository<BatchPersistenceModel>>;

    const adapter = new PortfolioBiomassAdapter(repository);
    expect(await adapter.getTotalBiomassKg('p-1')).toBe(0);
  });
});
