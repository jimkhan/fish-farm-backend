import { WaterThreshold } from '../domain/water-threshold.entity';
import { GetThresholdsUseCase } from './get-thresholds.usecase';
import { WaterThresholdRepositoryPort } from './ports/water-threshold-repository.port';

describe('GetThresholdsUseCase (TASK-023, CON-027a, AC-085)', () => {
  it('returns all 7 parameters, using seeded defaults when nothing is configured', async () => {
    const thresholds: jest.Mocked<WaterThresholdRepositoryPort> = {
      findAllInCurrentProject: jest.fn().mockResolvedValue([]),
      findByParameter: jest.fn(),
      save: jest.fn(),
    };
    const useCase = new GetThresholdsUseCase(thresholds);
    const result = await useCase.execute();

    expect(result).toHaveLength(7);
    const doThreshold = result.find((t) => t.parameter === 'DO');
    expect(doThreshold).toEqual({ parameter: 'DO', min: 4, max: null, critical: 3 });
  });

  it('an explicit project override takes precedence over the seeded default', async () => {
    const override = WaterThreshold.reconstitute({
      id: 't-1',
      projectId: 'p-1',
      parameter: 'DO',
      min: 6,
      max: null,
      critical: 5,
    });
    const thresholds: jest.Mocked<WaterThresholdRepositoryPort> = {
      findAllInCurrentProject: jest.fn().mockResolvedValue([override]),
      findByParameter: jest.fn(),
      save: jest.fn(),
    };
    const useCase = new GetThresholdsUseCase(thresholds);
    const result = await useCase.execute();

    const doThreshold = result.find((t) => t.parameter === 'DO');
    expect(doThreshold).toEqual({ parameter: 'DO', min: 6, max: null, critical: 5 });
  });
});
