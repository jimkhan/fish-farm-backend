import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ForbiddenError, ScopeRequiredError } from '../errors/domain-error';
import { MembershipResolverPort } from './membership-resolver.port';
import { ProjectScopeGuard } from './project-scope.guard';
import { RequestWithTenant } from './tenant-context';

interface TestRequest extends RequestWithTenant {
  params?: Record<string, string>;
  user?: { id: string };
}

function contextFor(req: TestRequest): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => undefined,
    getClass: () => undefined,
  } as unknown as ExecutionContext;
}

function reflectorReturning(scoped: boolean | undefined): Reflector {
  return { getAllAndOverride: jest.fn().mockReturnValue(scoped) } as unknown as Reflector;
}

const resolver: MembershipResolverPort = {
  resolve: jest.fn(async (userId: string) =>
    userId === 'user-a' ? [{ projectId: 'p-1', role: 'OWNER' as const }] : [],
  ),
};

describe('ProjectScopeGuard (TASK-004, FT-003, R3/R4)', () => {
  it('populates request.tenant for a member of the referenced project (AC-003 precondition)', async () => {
    const guard = new ProjectScopeGuard(reflectorReturning(undefined), resolver);
    const req: TestRequest = { params: { projectId: 'p-1' }, user: { id: 'user-a' } };
    await expect(guard.canActivate(contextFor(req))).resolves.toBe(true);
    expect(req.tenant).toEqual({ userId: 'user-a', projectId: 'p-1', role: 'OWNER' });
  });

  it('denies a non-member with the uniform ForbiddenError — no existence disclosure (AC-004)', async () => {
    const guard = new ProjectScopeGuard(reflectorReturning(undefined), resolver);
    const req: TestRequest = { params: { projectId: 'p-1' }, user: { id: 'user-b' } };
    await expect(guard.canActivate(contextFor(req))).rejects.toThrow(ForbiddenError);
    expect(req.tenant).toBeUndefined();
  });

  it('denies an unauthenticated request on a project-scoped route', async () => {
    const guard = new ProjectScopeGuard(reflectorReturning(undefined), resolver);
    const req: TestRequest = { params: { projectId: 'p-1' } };
    await expect(guard.canActivate(contextFor(req))).rejects.toThrow(ForbiddenError);
  });

  it('fails closed when no MembershipResolverPort is bound (pre-MOD-02)', async () => {
    const guard = new ProjectScopeGuard(reflectorReturning(undefined), null);
    const req: TestRequest = { params: { projectId: 'p-1' }, user: { id: 'user-a' } };
    await expect(guard.canActivate(contextFor(req))).rejects.toThrow(ForbiddenError);
  });

  it('rejects a @ProjectScoped route with no projectId as SCOPE_REQUIRED (AC-005)', async () => {
    const guard = new ProjectScopeGuard(reflectorReturning(true), resolver);
    const req: TestRequest = { params: {}, user: { id: 'user-a' } };
    await expect(guard.canActivate(contextFor(req))).rejects.toThrow(ScopeRequiredError);
  });

  it('treats an empty-string projectId param as missing scope, not as a lookup', async () => {
    const guard = new ProjectScopeGuard(reflectorReturning(true), resolver);
    const req: TestRequest = { params: { projectId: '' }, user: { id: 'user-a' } };
    await expect(guard.canActivate(contextFor(req))).rejects.toThrow(ScopeRequiredError);
  });

  it('passes non-project routes through untouched (health, auth, /me, portfolio)', async () => {
    const guard = new ProjectScopeGuard(reflectorReturning(undefined), resolver);
    const req: TestRequest = { params: {} };
    await expect(guard.canActivate(contextFor(req))).resolves.toBe(true);
    expect(req.tenant).toBeUndefined();
  });
});
