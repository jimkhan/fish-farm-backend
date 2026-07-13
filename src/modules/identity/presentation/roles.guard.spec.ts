import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ForbiddenError } from '../../../shared-kernel/errors/domain-error';
import { ProjectRole } from '../../../shared-kernel/tenant/membership-resolver.port';
import { RolesGuard } from './roles.guard';
import { RolesMetadata } from './roles.decorator';

interface TestRequest {
  tenant?: { role: ProjectRole };
}

function contextFor(req: TestRequest): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => undefined,
    getClass: () => undefined,
  } as unknown as ExecutionContext;
}

function reflectorReturning(meta: RolesMetadata | undefined): Reflector {
  return { getAllAndOverride: jest.fn().mockReturnValue(meta) } as unknown as Reflector;
}

describe('RolesGuard (TASK-010, MOD-02 F3, AC-023/025/026)', () => {
  it('allows a role in the @Roles() allow-list', () => {
    const guard = new RolesGuard(reflectorReturning({ roles: ['OWNER'] }));
    const req: TestRequest = { tenant: { role: 'OWNER' } };
    expect(guard.canActivate(contextFor(req))).toBe(true);
  });

  it('AC-023: denies a role outside the allow-list with the configured message', () => {
    const guard = new RolesGuard(
      reflectorReturning({ roles: ['OWNER'], message: 'Only the project owner can manage members.' }),
    );
    const req: TestRequest = { tenant: { role: 'WORKER' } };
    expect(() => guard.canActivate(contextFor(req))).toThrow(ForbiddenError);
    try {
      guard.canActivate(contextFor(req));
    } catch (err) {
      expect((err as ForbiddenError).message).toBe('Only the project owner can manage members.');
    }
  });

  it('AC-025: denies PARTNER on a write-capability-gated route', () => {
    const guard = new RolesGuard(reflectorReturning({ roles: ['OWNER', 'WORKER'] }));
    const req: TestRequest = { tenant: { role: 'PARTNER' } };
    expect(() => guard.canActivate(contextFor(req))).toThrow(ForbiddenError);
  });

  it('AC-026: denies WORKER on a finance/settings-capability-gated route', () => {
    const guard = new RolesGuard(reflectorReturning({ roles: ['OWNER', 'PARTNER'] }));
    const req: TestRequest = { tenant: { role: 'WORKER' } };
    expect(() => guard.canActivate(contextFor(req))).toThrow(ForbiddenError);
  });

  it('denies when no tenant scope is present at all', () => {
    const guard = new RolesGuard(reflectorReturning({ roles: ['OWNER'] }));
    expect(() => guard.canActivate(contextFor({}))).toThrow(ForbiddenError);
  });

  it('passes through routes with no @Roles() metadata', () => {
    const guard = new RolesGuard(reflectorReturning(undefined));
    expect(guard.canActivate(contextFor({}))).toBe(true);
  });
});
