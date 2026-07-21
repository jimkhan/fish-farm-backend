import { Camera } from '../../domain/camera.entity';

/** Wire shape of `GET .../camera` (CON-036, AC-118). Deliberately has no `rtspUrl` field —
 * the raw RTSP URL/credentials never leave the backend (ADR-012, R1). */
export interface CameraConfigResponse {
  projectId: string;
  streamUrl: string;
  protocol: string;
  online: boolean;
}

export function toCameraConfigResponse(camera: Camera): CameraConfigResponse {
  return {
    projectId: camera.projectId,
    streamUrl: camera.streamUrl,
    protocol: camera.protocol,
    online: camera.online,
  };
}
