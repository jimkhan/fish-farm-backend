import { Camera } from '../../domain/camera.entity';

/** Tenant-scoped (ADR-006). */
export interface CameraRepositoryPort {
  /** `null` if the project has no camera configured yet — a legitimate, common MVP state (no
   * write endpoint exists in this task's scope; see `GetCameraConfigUseCase`). */
  findForCurrentProject(): Promise<Camera | null>;
}

export const CAMERA_REPOSITORY = 'CameraRepositoryPort';
