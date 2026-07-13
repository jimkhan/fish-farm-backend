import type { EntityManager } from 'typeorm';
import { AuditEntryPersistenceModel } from './audit-entry.persistence-model';
import { AuditWriter } from './audit.writer';

describe('AuditWriter (TASK-005, R7 append-only)', () => {
  it('inserts the entry through the caller-provided (transactional) manager', async () => {
    const manager = { insert: jest.fn().mockResolvedValue(undefined) };
    const writer = new AuditWriter();

    const entry = {
      projectId: 'p-1',
      actorUserId: 'u-1',
      action: 'POST /projects/:projectId/widgets',
      entityType: 'Widgets',
      entityId: 'e-1',
      metadata: { params: { projectId: 'p-1' } },
    };
    await writer.write(manager as unknown as EntityManager, entry);

    expect(manager.insert).toHaveBeenCalledWith(AuditEntryPersistenceModel, entry);
  });

  it('exposes no update or delete path (append-only by construction)', () => {
    const writer = new AuditWriter() as unknown as Record<string, unknown>;
    expect(writer.update).toBeUndefined();
    expect(writer.delete).toBeUndefined();
    expect(writer.remove).toBeUndefined();
  });
});
