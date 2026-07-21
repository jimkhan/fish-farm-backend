import { NotFoundError } from '../../../shared-kernel/errors/domain-error';
import { Camera } from '../domain/camera.entity';
import { GetCameraConfigUseCase } from './get-camera-config.usecase';
import { CameraRepositoryPort } from './ports/camera-repository.port';

const camera = Camera.reconstitute({
  id: 'cam-1',
  projectId: 'p-1',
  rtspUrl: 'rtsp://admin:supersecret@192.168.1.50:554/stream1',
  streamUrl: 'https://media.example.com/hls/p-1/index.m3u8',
  protocol: 'HLS',
  online: true,
});

function setup(overrides: { camera?: Camera | null } = {}) {
  const cameras: jest.Mocked<CameraRepositoryPort> = {
    findForCurrentProject: jest
      .fn()
      .mockResolvedValue(overrides.camera === undefined ? camera : overrides.camera),
  };
  const useCase = new GetCameraConfigUseCase(cameras);
  return { useCase, cameras };
}

describe('GetCameraConfigUseCase (TASK-035, CON-036, AC-118/119)', () => {
  it('AC-118: returns the camera config including the raw rtspUrl on the domain object', async () => {
    const { useCase } = setup();
    const result = await useCase.execute();
    expect(result.streamUrl).toBe('https://media.example.com/hls/p-1/index.m3u8');
    expect(result.protocol).toBe('HLS');
    expect(result.online).toBe(true);
    // The domain entity legitimately carries rtspUrl — redaction is the presentation layer's job.
    expect(result.rtspUrl).toBe('rtsp://admin:supersecret@192.168.1.50:554/stream1');
  });

  it('AC-119: online:false is returned verbatim (a stored field, never recomputed here)', async () => {
    const offlineCamera = Camera.reconstitute({
      id: 'cam-1',
      projectId: 'p-1',
      rtspUrl: 'rtsp://admin:supersecret@192.168.1.50:554/stream1',
      streamUrl: 'https://media.example.com/hls/p-1/index.m3u8',
      protocol: 'HLS',
      online: false,
    });
    const { useCase } = setup({ camera: offlineCamera });
    const result = await useCase.execute();
    expect(result.online).toBe(false);
  });

  it('no camera configured for the project is a legitimate NotFoundError, not a crash', async () => {
    const { useCase } = setup({ camera: null });
    await expect(useCase.execute()).rejects.toBeInstanceOf(NotFoundError);
  });
});
