import { User } from '../domain/user.entity';
import { UnauthenticatedError } from '../../../shared-kernel/errors/domain-error';
import { AccessTokenIssuerPort } from '../application/ports/access-token-issuer.port';
import { UserRepositoryPort } from '../application/ports/user-repository.port';
import { AuthMiddleware } from './auth.middleware';

const activeUser = User.reconstitute({
  id: 'user-1',
  email: 'owner@example.com',
  name: 'Owner',
  passwordHash: 'hash',
  status: 'ACTIVE',
  createdAt: new Date(),
});

const deactivatedUser = User.reconstitute({
  id: 'user-2',
  email: 'gone@example.com',
  name: 'Gone',
  passwordHash: 'hash',
  status: 'DEACTIVATED',
  createdAt: new Date(),
});

function setup(overrides: { verify?: ReturnType<AccessTokenIssuerPort['verify']>; user?: User | null } = {}) {
  const accessTokens: jest.Mocked<AccessTokenIssuerPort> = {
    issue: jest.fn(),
    verify: jest.fn().mockReturnValue(overrides.verify === undefined ? { sub: 'user-1' } : overrides.verify),
  };
  const users: jest.Mocked<UserRepositoryPort> = {
    findByEmail: jest.fn(),
    findById: jest.fn().mockResolvedValue(overrides.user === undefined ? activeUser : overrides.user),
    updatePasswordHash: jest.fn(),
    create: jest.fn(),
  };
  const middleware = new AuthMiddleware(accessTokens, users);
  const next = jest.fn();
  return { middleware, accessTokens, users, next };
}

describe('AuthMiddleware (TASK-008, ADR-005, AC-028)', () => {
  it('no Authorization header → passes through untouched (public routes)', async () => {
    const { middleware, next } = setup();
    const req: { headers: Record<string, string>; user?: { id: string } } = { headers: {} };

    await middleware.use(req, {}, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.user).toBeUndefined();
  });

  it('a valid bearer token sets request.user', async () => {
    const { middleware, next } = setup();
    const req: { headers: Record<string, string>; user?: { id: string } } = {
      headers: { authorization: 'Bearer valid.jwt.token' },
    };

    await middleware.use(req, {}, next);

    expect(req.user).toEqual({ id: 'user-1' });
    expect(next).toHaveBeenCalledWith();
  });

  it('a non-bearer scheme is rejected with UnauthenticatedError', async () => {
    const { middleware, next } = setup();
    const req = { headers: { authorization: 'Basic dXNlcjpwYXNz' } };

    await middleware.use(req, {}, next);

    expect(next).toHaveBeenCalledWith(expect.any(UnauthenticatedError));
  });

  it('an invalid/expired token is rejected with UnauthenticatedError', async () => {
    const { middleware, next } = setup({ verify: null });
    const req = { headers: { authorization: 'Bearer garbage' } };

    await middleware.use(req, {}, next);

    expect(next).toHaveBeenCalledWith(expect.any(UnauthenticatedError));
  });

  it('AC-028: a valid signature for a deactivated user is rejected with UnauthenticatedError', async () => {
    const { middleware, next } = setup({ verify: { sub: 'user-2' }, user: deactivatedUser });
    const req = { headers: { authorization: 'Bearer valid.jwt.for.deactivated' } };

    await middleware.use(req, {}, next);

    expect(next).toHaveBeenCalledWith(expect.any(UnauthenticatedError));
  });

  it('AC-028: a valid signature for a since-deleted user is rejected with UnauthenticatedError', async () => {
    const { middleware, next } = setup({ verify: { sub: 'user-404' }, user: null });
    const req = { headers: { authorization: 'Bearer valid.jwt.for.deleted' } };

    await middleware.use(req, {}, next);

    expect(next).toHaveBeenCalledWith(expect.any(UnauthenticatedError));
  });
});
