import { Inject, Injectable } from '@nestjs/common';
import { NotFoundError } from '../../../shared-kernel/errors/domain-error';
import { Camera } from '../domain/camera.entity';
import { CAMERA_REPOSITORY, CameraRepositoryPort } from './ports/camera-repository.port';

/**
 * `GET /projects/{projectId}/camera` (CON-036, F1, AC-118/119/124, R1). Member-only — no
 * `@Roles()` gate (GLOSSARY confirms camera *view* is part of every role's normal operational
 * access, including Worker; only camera *recording*, P3, would be different).
 *
 * **Read-only by deliberate, human-confirmed scope**: the module doc's own §4.7 states "no new
 * endpoints/schemas required for MVP" and names only a read/query use-case in its file tree — no
 * write endpoint exists anywhere in the spec for *setting* `rtspUrl`/`streamUrl`. A project with
 * no camera row is therefore a legitimate, expected state (not an error to work around), and
 * provisioning one is an out-of-band ops concern (e.g. whoever installs the physical camera),
 * not something this task builds. `online` is a stored field the row itself already carries
 * (ERD `CAMERA.online`, not live-computed here) — no MediaMTX API call happens in this use-case.
 */
@Injectable()
export class GetCameraConfigUseCase {
  constructor(@Inject(CAMERA_REPOSITORY) private readonly cameras: CameraRepositoryPort) {}

  async execute(): Promise<Camera> {
    const camera = await this.cameras.findForCurrentProject();
    if (!camera) {
      throw new NotFoundError('No camera is configured for this project.');
    }
    return camera;
  }
}
