import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import type { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { AuditEntryPersistenceModel } from './audit-entry.persistence-model';

export interface AuditEntryInput {
  projectId: string | null;
  actorUserId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: Record<string, unknown> | null;
}

/**
 * The only write path to `audit_entry` (TASK-005, R7 — append-only: insert, never update or
 * delete). Takes the caller's `EntityManager` so the entry joins the caller's transaction —
 * the audit write committing separately from the domain write would defeat AC-006/007.
 */
@Injectable()
export class AuditWriter {
  async write(manager: EntityManager, entry: AuditEntryInput): Promise<void> {
    // The cast is needed only because jsonb defeats QueryDeepPartialEntity's inference;
    // AuditEntryInput matches the persistence model's columns 1:1.
    await manager.insert(
      AuditEntryPersistenceModel,
      { ...entry } as QueryDeepPartialEntity<AuditEntryPersistenceModel>,
    );
  }
}
