import { Column, Entity, Index, PrimaryColumn } from 'typeorm';
import { SyncEntityType, SyncMutationStatus } from '../../domain/sync-mutation.entity';

/** `sync_mutation` table (TASK-040, ERD `SYNC_MUTATION`). Global idempotency store — not
 * project-owned; `client_mutation_id` (minted offline, ADR-016) is the primary key. */
@Entity('sync_mutation')
export class SyncMutationPersistenceModel {
  @PrimaryColumn('varchar', { name: 'client_mutation_id' })
  clientMutationId!: string;

  @Index()
  @Column('uuid', { name: 'project_id' })
  projectId!: string;

  @Column('uuid', { name: 'user_id' })
  userId!: string;

  @Column('varchar')
  entity!: SyncEntityType;

  @Column('varchar')
  status!: SyncMutationStatus;

  @Column('uuid', { name: 'server_id', nullable: true })
  serverId!: string | null;

  @Column('timestamptz', { name: 'processed_at', default: () => 'now()' })
  processedAt!: Date;
}
