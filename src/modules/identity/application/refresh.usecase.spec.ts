import { ConfigService } from '@nestjs/config';
import { RefreshToken } from '../domain/refresh-token.entity';
import { User } from '../domain/user.entity';
import { TokenRevokedError } from '../domain/identity-errors';
import { AccessTokenIssuerPort } from './ports/access-token-issuer.port';
import { RefreshTokenRepositoryPort } from './ports/refresh-token-repository.port';
import { UserRepositoryPort } from './ports/user-repository.port';
import { RefreshUseCase } from './refresh.usecase';
import { hashOpaqueToken } from './token-hash.util';

const RAW_TOKEN = 'raw-refresh-secret';

const activeUser = User.reconstitute({
  id: 'u-1',
  email: 'owner@example.com',
  name: 'Owner',
  passwordHash: 'hash',
  status: 'ACTIVE',
  createdAt: new Date(),
});

function usableToken(overrides: Partial<Parameters<typeof RefreshToken.reconstitute>[0]> = {}) {
  return RefreshToken.reconstitute({
    id: 't-1',
    userId: 'u-1',
    familyId: 'f-1',
    tokenHash: hashOpaqueToken(RAW_TOKEN),
    expiresAt: new Date(Date.now() + 60_000),
    revokedAt: null,
    ...overrides,
  });
}

function setup(overrides: { token?: RefreshToken | null; user?: User | null } = {}) {
  const users: jest.Mocked<UserRepositoryPort> = {
    findByEmail: jest.fn(),
    findById: jest.fn().mockResolvedValue(overrides.user === undefined ? activeUser : overrides.user),
    updatePasswordHash: jest.fn(),
    create: jest.fn(),
  };
  const refreshTokens: jest.Mocked<RefreshTokenRepositoryPort> = {
    save: jest.fn().mockResolvedValue(undefined),
    findByHash: jest.fn().mockResolvedValue(overrides.token === undefined ? usableToken() : overrides.token),
    revokeById: jest.fn().mockResolvedValue(undefined),
    revokeFamily: jest.fn().mockResolvedValue(undefined),
  };
  const accessTokens: jest.Mocked<AccessTokenIssuerPort> = {
    issue: jest.fn().mockReturnValue({ token: 'jwt.access.token', expiresInSeconds: 900 }),
    verify: jest.fn(),
  };
  const config = { get: jest.fn().mockReturnValue(30) } as unknown as ConfigService;

  const useCase = new RefreshUseCase(users, refreshTokens, accessTokens, config as never);
  return { useCase, users, refreshTokens, accessTokens };
}

describe('RefreshUseCase (TASK-008, CON-002, AC-019, MOD-02 R2)', () => {
  it('rotates: revokes the presented token and issues a new one in the same family', async () => {
    const { useCase, refreshTokens } = setup();

    const result = await useCase.execute(RAW_TOKEN);

    expect(result.accessToken).toBe('jwt.access.token');
    expect(refreshTokens.revokeById).toHaveBeenCalledWith('t-1', expect.any(Date));
    expect(refreshTokens.save).toHaveBeenCalledTimes(1);
    const saved = refreshTokens.save.mock.calls[0][0] as RefreshToken;
    expect(saved.familyId).toBe('f-1'); // same family — rotation, not a new session
    expect(saved.tokenHash).not.toBe(hashOpaqueToken(RAW_TOKEN)); // a genuinely new token
  });

  it('an unknown token → TOKEN_REVOKED', async () => {
    const { useCase } = setup({ token: null });
    await expect(useCase.execute('never-issued')).rejects.toBeInstanceOf(TokenRevokedError);
  });

  it('AC-019: a replayed (already-revoked) token → TOKEN_REVOKED AND revokes the whole family', async () => {
    const { useCase, refreshTokens } = setup({
      token: usableToken({ revokedAt: new Date('2026-01-01') }),
    });

    await expect(useCase.execute(RAW_TOKEN)).rejects.toBeInstanceOf(TokenRevokedError);
    expect(refreshTokens.revokeFamily).toHaveBeenCalledWith('f-1', expect.any(Date));
    expect(refreshTokens.save).not.toHaveBeenCalled(); // no new token minted on replay
  });

  it('an expired (but not revoked) token → TOKEN_REVOKED, without nuking the family', async () => {
    const { useCase, refreshTokens } = setup({
      token: usableToken({ expiresAt: new Date(Date.now() - 1) }),
    });

    await expect(useCase.execute(RAW_TOKEN)).rejects.toBeInstanceOf(TokenRevokedError);
    expect(refreshTokens.revokeFamily).not.toHaveBeenCalled();
  });

  it('a deactivated user → TOKEN_REVOKED (no distinct signal)', async () => {
    const { useCase } = setup({ user: null });
    await expect(useCase.execute(RAW_TOKEN)).rejects.toBeInstanceOf(TokenRevokedError);
  });
});
