import { ScopeRequiredError } from '../errors/domain-error';
import { TenantContext } from './tenant-context';

describe('TenantContext (TASK-004, FT-003)', () => {
  it('exposes the state the guard bound to the request', () => {
    const ctx = new TenantContext({
      tenant: { userId: 'u-1', projectId: 'p-1', role: 'OWNER' },
    });
    expect(ctx.isPopulated).toBe(true);
    expect(ctx.userId).toBe('u-1');
    expect(ctx.projectId).toBe('p-1');
    expect(ctx.role).toBe('OWNER');
  });

  it('throws SCOPE_REQUIRED when read before the guard populated it (AC-005, R2)', () => {
    const ctx = new TenantContext({});
    expect(ctx.isPopulated).toBe(false);
    expect(() => ctx.projectId).toThrow(ScopeRequiredError);
    expect(() => ctx.userId).toThrow(ScopeRequiredError);
    expect(() => ctx.role).toThrow(ScopeRequiredError);
  });
});
