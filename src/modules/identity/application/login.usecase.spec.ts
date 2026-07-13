import { ConfigService } from '@nestjs/config';
import { User } from '../domain/user.entity';
import { InvalidCredentialsError } from '../domain/identity-errors';
import { AccessTokenIssuerPort } from './ports/access-token-issuer.port';
import { PasswordHasherPort } from './ports/password-hasher.port';
import { RefreshTokenRepositoryPort } from './ports/refresh-token-repository.port';
import { UserRepositoryPort } from './ports/user-repository.port';
import { LoginUseCase } from './login.usecase';

const activeUser = User.reconstitute({
  id: 'u-1',
  email: 'owner@example.com',
  name: 'Owner',
  passwordHash: 'stored-hash',
  status: 'ACTIVE',
  createdAt: new Date(),
});

const deactivatedUser = User.reconstitute({
  id: 'u-2',
  email: 'gone@example.com',
  name: 'Gone',
  passwordHash: 'stored-hash',
  status: 'DEACTIVATED',
  createdAt: new Date(),
});

function setup(overrides: { user?: User | null; passwordValid?: boolean } = {}) {
  const users: jest.Mocked<UserRepositoryPort> = {
    findByEmail: jest.fn().mockResolvedValue(overrides.user ?? null),
    findById: jest.fn(),
    updatePasswordHash: jest.fn(),
    create: jest.fn(),
  };
  const hasher: jest.Mocked<PasswordHasherPort> = {
    hash: jest.fn(),
    verify: jest.fn().mockResolvedValue(overrides.passwordValid ?? false),
  };
  const refreshTokens: jest.Mocked<RefreshTokenRepositoryPort> = {
    save: jest.fn().mockResolvedValue(undefined),
    findByHash: jest.fn(),
    revokeById: jest.fn(),
    revokeFamily: jest.fn(),
  };
  const accessTokens: jest.Mocked<AccessTokenIssuerPort> = {
    issue: jest.fn().mockReturnValue({ token: 'jwt.access.token', expiresInSeconds: 900 }),
    verify: jest.fn(),
  };
  const config = { get: jest.fn().mockReturnValue(30) } as unknown as ConfigService;

  const useCase = new LoginUseCase(users, hasher, refreshTokens, accessTokens, config as never);
  return { useCase, users, hasher, refreshTokens, accessTokens };
}

describe('LoginUseCase (TASK-008, CON-001, AC-015/016/017)', () => {
  it('AC-015: valid credentials return an access token and a refresh token', async () => {
    const { useCase, refreshTokens, accessTokens } = setup({
      user: activeUser,
      passwordValid: true,
    });

    const result = await useCase.execute('owner@example.com', 'correct-password');

    expect(result.accessToken).toBe('jwt.access.token');
    expect(result.expiresIn).toBe(900);
    expect(typeof result.refreshToken).toBe('string');
    expect(result.refreshToken.length).toBeGreaterThan(0);
    expect(accessTokens.issue).toHaveBeenCalledWith('u-1');
    expect(refreshTokens.save).toHaveBeenCalledTimes(1);
  });

  it('AC-016: unknown email → INVALID_CREDENTIALS with the uniform message', async () => {
    const { useCase } = setup({ user: null });
    const promise = useCase.execute('nobody@example.com', 'whatever');
    await expect(promise).rejects.toBeInstanceOf(InvalidCredentialsError);
    await expect(promise).rejects.toThrow('Invalid email or password.');
  });

  it('AC-016: wrong password → the identical INVALID_CREDENTIALS error', async () => {
    const { useCase } = setup({ user: activeUser, passwordValid: false });
    const promise = useCase.execute('owner@example.com', 'wrong');
    await expect(promise).rejects.toBeInstanceOf(InvalidCredentialsError);
    await expect(promise).rejects.toThrow('Invalid email or password.');
  });

  it('a deactivated user is rejected the same as wrong credentials (no distinct signal)', async () => {
    const { useCase } = setup({ user: deactivatedUser, passwordValid: true });
    await expect(useCase.execute('gone@example.com', 'correct-password')).rejects.toBeInstanceOf(
      InvalidCredentialsError,
    );
  });

  it('always calls the hasher — even for an unknown email — so timing does not disclose existence (AC-016)', async () => {
    const { useCase, hasher } = setup({ user: null });
    await useCase.execute('nobody@example.com', 'whatever').catch(() => undefined);
    expect(hasher.verify).toHaveBeenCalledWith(null, 'whatever');
  });

  it('passes the real password hash to the hasher for an active user', async () => {
    const { useCase, hasher } = setup({ user: activeUser, passwordValid: true });
    await useCase.execute('owner@example.com', 'correct-password');
    expect(hasher.verify).toHaveBeenCalledWith('stored-hash', 'correct-password');
  });

  it('does not pass a deactivated user\'s hash to the hasher (treated as no user)', async () => {
    const { useCase, hasher } = setup({ user: deactivatedUser, passwordValid: true });
    await useCase.execute('gone@example.com', 'correct-password').catch(() => undefined);
    expect(hasher.verify).toHaveBeenCalledWith(null, 'correct-password');
  });
});
