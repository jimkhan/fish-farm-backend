import { WaterReading } from '../domain/water-reading.entity';
import { ListReadingsUseCase } from './list-readings.usecase';
import { WaterReadingRepositoryPort } from './ports/water-reading-repository.port';

describe('ListReadingsUseCase (TASK-023, CON-025, AC-090)', () => {
  it('lists every reading for a pond, optionally filtered by parameter', async () => {
    const reading = WaterReading.reconstitute({
      id: 'r-1',
      projectId: 'p-1',
      pondId: 'pond-1',
      parameter: 'PH',
      value: 7.5,
      source: 'MANUAL',
      deviceId: null,
      readAt: new Date(),
      clientMutationId: 'cmid-1',
      createdAt: new Date(),
    });
    const readings: jest.Mocked<WaterReadingRepositoryPort> = {
      findForPond: jest.fn().mockResolvedValue([reading]),
      findByClientMutationId: jest.fn(),
      save: jest.fn(),
    };
    const useCase = new ListReadingsUseCase(readings);

    const result = await useCase.execute('pond-1', 'PH');
    expect(result).toEqual([reading]);
    expect(readings.findForPond).toHaveBeenCalledWith('pond-1', 'PH');
  });
});
