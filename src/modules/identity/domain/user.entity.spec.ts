import { User } from './user.entity';

const baseProps = {
  id: 'u-1',
  email: 'owner@example.com',
  name: 'Owner',
  passwordHash: 'hash',
  createdAt: new Date('2026-01-01T00:00:00Z'),
};

describe('User (TASK-008)', () => {
  it('exposes its props via getters', () => {
    const user = User.reconstitute({ ...baseProps, status: 'ACTIVE' });
    expect(user.id).toBe('u-1');
    expect(user.email).toBe('owner@example.com');
    expect(user.name).toBe('Owner');
    expect(user.passwordHash).toBe('hash');
    expect(user.status).toBe('ACTIVE');
  });

  it('isActive is true only when status is ACTIVE (AC-028)', () => {
    expect(User.reconstitute({ ...baseProps, status: 'ACTIVE' }).isActive).toBe(true);
    expect(User.reconstitute({ ...baseProps, status: 'DEACTIVATED' }).isActive).toBe(false);
  });
});
