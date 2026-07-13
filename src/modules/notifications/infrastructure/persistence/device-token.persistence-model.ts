import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { DevicePlatform } from '../../domain/device-token.entity';

/** `device_token` table (TASK-016, ERD `DEVICE_TOKEN`). User-owned, not project-owned. */
@Entity('device_token')
export class DeviceTokenPersistenceModel {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column('uuid', { name: 'user_id' })
  userId!: string;

  @Index({ unique: true })
  @Column('varchar', { name: 'fcm_token' })
  fcmToken!: string;

  @Column('varchar', { nullable: true })
  platform!: DevicePlatform | null;

  @Column('timestamptz', { name: 'registered_at', default: () => 'now()' })
  registeredAt!: Date;
}
