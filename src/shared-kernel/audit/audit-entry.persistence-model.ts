import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Append-only audit trail row (TASK-005, FT-005, NFR-012; ERD `AUDIT_ENTRY`). Deliberately does
 * NOT extend `BaseProjectOwnedPersistenceModel`: `project_id` is nullable because platform-level
 * actions (e.g. login, password reset) are not scoped to a project — it is a platform table,
 * allowlisted in the project-owned schema test. No update/delete path exists anywhere (R7);
 * rows are written only by `AuditWriter`, inside the request's transaction.
 */
@Entity('audit_entry')
export class AuditEntryPersistenceModel {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column('uuid', { name: 'project_id', nullable: true })
  projectId!: string | null;

  /** Nullable: pre-auth platform actions (e.g. password-reset request) have no known actor. */
  @Column('uuid', { name: 'actor_user_id', nullable: true })
  actorUserId!: string | null;

  /** Route-shaped action, e.g. `POST /projects/:projectId/ponds` — ids live in entity_id. */
  @Column('varchar')
  action!: string;

  @Column('varchar', { name: 'entity_type' })
  entityType!: string;

  @Column('uuid', { name: 'entity_id', nullable: true })
  entityId!: string | null;

  @Column('timestamptz', { name: 'occurred_at', default: () => 'now()' })
  occurredAt!: Date;

  @Column('jsonb', { nullable: true })
  metadata!: Record<string, unknown> | null;
}
