import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { DeliveryChannel } from '../../domain/notification-channel.port';
import { DeliveryStatus } from '../../domain/delivery-attempt.entity';

/** `delivery_attempt` table (TASK-016, module doc §4.3 — a documented ERD gap this task adds,
 * synced back). User/alert-owned, not project-owned. */
@Entity('delivery_attempt')
export class DeliveryAttemptPersistenceModel {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column('uuid', { name: 'alert_id' })
  alertId!: string;

  @Column('varchar')
  channel!: DeliveryChannel;

  @Column('varchar')
  status!: DeliveryStatus;

  @Column('timestamptz', { name: 'attempted_at', default: () => 'now()' })
  attemptedAt!: Date;

  @Column('varchar', { nullable: true })
  error!: string | null;
}
