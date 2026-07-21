import { Column, Entity } from 'typeorm';
import { BaseProjectOwnedPersistenceModel } from '../../../../platform/persistence/base-project-owned.persistence-model';
import { CameraProtocol } from '../../domain/camera.entity';

/** `camera` table (TASK-035, ERD `CAMERA`, ADR-012). Project-owned (R9). `rtsp_url` is
 * server-side only — never selected into a response DTO (enforced in the mapper/controller, not
 * by column privileges — same "trust the layering" pattern as every other secret-bearing field
 * in this codebase). */
@Entity('camera')
export class CameraPersistenceModel extends BaseProjectOwnedPersistenceModel {
  @Column('varchar', { name: 'rtsp_url' })
  rtspUrl!: string;

  @Column('varchar', { name: 'stream_url' })
  streamUrl!: string;

  @Column('varchar')
  protocol!: CameraProtocol;

  @Column('boolean')
  online!: boolean;
}
