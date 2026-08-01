import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * `device` table (TASK-027, ERD `DEVICE`). Deliberately does NOT extend
 * `BaseProjectOwnedPersistenceModel`: a device is authenticated and resolved *before* any tenant
 * scope exists (the lookup is by `device_key_hash`, not filtered by `project_id`), so it is read
 * through a plain unscoped repository — the same reason `refresh_token` is not project-scoped. It
 * still carries an indexed `project_id` (the device's own project) per CLAUDE.md §5.
 */
@Entity('device')
export class DevicePersistenceModel {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column('uuid', { name: 'project_id' })
  projectId!: string;

  @Column('uuid', { name: 'pond_id' })
  pondId!: string;

  @Index({ unique: true })
  @Column('varchar', { name: 'device_key_hash' })
  deviceKeyHash!: string;

  @Column('varchar')
  label!: string;

  @Column('timestamptz', { name: 'registered_at', default: () => 'now()' })
  registeredAt!: Date;
}
