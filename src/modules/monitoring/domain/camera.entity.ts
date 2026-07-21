export type CameraProtocol = 'HLS' | 'WEBRTC';

/**
 * Pure domain `Camera` (TASK-035, MOD-10 F1/R1, ERD `CAMERA`, ADR-012). `rtspUrl` is a raw
 * credential-bearing field — it exists on this entity because the domain layer legitimately owns
 * it (this is where the "never expose it" rule is enforced), but no mapper ever copies it onto a
 * response DTO (ADR-012, AC-118). `online` is a stored, not live-computed, field — provisioned
 * and kept current by whatever process configures the camera in the first place (out of scope
 * here; see `GetCameraConfigUseCase`'s doc comment).
 */
export interface CameraProps {
  readonly id: string;
  readonly projectId: string;
  readonly rtspUrl: string;
  readonly streamUrl: string;
  readonly protocol: CameraProtocol;
  readonly online: boolean;
}

export class Camera {
  private constructor(private readonly props: CameraProps) {}

  static reconstitute(props: CameraProps): Camera {
    return new Camera(props);
  }

  get id(): string {
    return this.props.id;
  }

  get projectId(): string {
    return this.props.projectId;
  }

  get rtspUrl(): string {
    return this.props.rtspUrl;
  }

  get streamUrl(): string {
    return this.props.streamUrl;
  }

  get protocol(): CameraProtocol {
    return this.props.protocol;
  }

  get online(): boolean {
    return this.props.online;
  }
}
