import { ProjectMembership } from './project-membership.entity';

const baseProps = {
  id: 'm-1',
  userId: 'u-1',
  projectId: 'p-1',
  role: 'OWNER' as const,
  createdAt: new Date(),
};

describe('ProjectMembership (TASK-010, MOD-02 §4.3)', () => {
  it('is active when status is ACTIVE', () => {
    const membership = ProjectMembership.reconstitute({ ...baseProps, status: 'ACTIVE' });
    expect(membership.isActive).toBe(true);
  });

  it('is not active once removed', () => {
    const membership = ProjectMembership.reconstitute({ ...baseProps, status: 'REMOVED' });
    expect(membership.isActive).toBe(false);
  });

  it('remove() returns a new REMOVED instance without mutating the original (R7 soft-delete)', () => {
    const membership = ProjectMembership.reconstitute({ ...baseProps, status: 'ACTIVE' });
    const removed = membership.remove();

    expect(removed.status).toBe('REMOVED');
    expect(removed.isActive).toBe(false);
    expect(membership.status).toBe('ACTIVE'); // original untouched
    expect(removed.id).toBe(membership.id);
    expect(removed.userId).toBe(membership.userId);
    expect(removed.projectId).toBe(membership.projectId);
    expect(removed.role).toBe(membership.role);
  });
});
