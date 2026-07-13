import { Column, Entity, Index } from 'typeorm';
import { BaseProjectOwnedPersistenceModel } from '../../../../platform/persistence/base-project-owned.persistence-model';
import { AlertSeverity, AlertState, AlertType } from '../../domain/alert.entity';

/**
 * `alert` table (TASK-015, ERD `ALERT` + `source_ref`/`resolved_at` — a documented ERD gap that
 * task closed, synced back to ERD.md; `escalated_at` added by TASK-017, another synced gap).
 * Project-owned (R1).
 */
@Entity('alert')
export class AlertPersistenceModel extends BaseProjectOwnedPersistenceModel {
  @Column('varchar')
  type!: AlertType;

  @Column('varchar')
  severity!: AlertSeverity;

  @Column('varchar')
  state!: AlertState;

  @Column('varchar')
  message!: string;

  @Column('varchar', { name: 'source_ref' })
  sourceRef!: string;

  // No unique DB constraint on (project_id, type, source_ref) — uplift/dedup only cares about
  // whether an ACTIVE (non-RESOLVED) match exists, and a resolved alert must be free to recur.
  @Index()
  @Column('varchar', { name: 'dedup_key' })
  dedupKey!: string;

  @Column('timestamptz', { name: 'raised_at' })
  raisedAt!: Date;

  @Column('timestamptz', { name: 'acknowledged_at', nullable: true })
  acknowledgedAt!: Date | null;

  @Column('timestamptz', { name: 'resolved_at', nullable: true })
  resolvedAt!: Date | null;

  @Column('timestamptz', { name: 'escalated_at', nullable: true })
  escalatedAt!: Date | null;
}
