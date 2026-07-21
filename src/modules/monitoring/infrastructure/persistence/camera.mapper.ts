import { Camera } from '../../domain/camera.entity';
import { CameraPersistenceModel } from './camera.persistence-model';

export function toDomain(model: CameraPersistenceModel): Camera {
  return Camera.reconstitute({
    id: model.id,
    projectId: model.projectId,
    rtspUrl: model.rtspUrl,
    streamUrl: model.streamUrl,
    protocol: model.protocol,
    online: model.online,
  });
}
