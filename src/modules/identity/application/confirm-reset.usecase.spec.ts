import { PasswordResetToken } from '../domain/password-reset-token.entity';
import { User } from '../domain/user.entity';
import { ResetTokenInvalidError } from '../domain/identity-errors';
import { ConfirmResetUseCase } from './confirm-reset.usecase';
import { PasswordHasherPort } from './ports/password-hasher.port';
import { PasswordResetTokenRepositoryPort } from './ports/password-reset-token-repository.port';
import { UserRepositoryPort } from './ports/user-repository.port';
import { hashOpaqueToken } from './token-hash.util';

const RAW_TOKEN = 'raw-reset-secret';

const activeUser = User.reconstitute({
  id: 'u-1',
  email: 'owner@example.com',
  name: 'Owner',
  passwordHash: 'old-hash',
  status: 'ACTIVE',
  createdAt: new Date(),
});

function usableToken(overrides: Partial<Parameters<typeof PasswordResetToken.reconstitute>[0]> = {}) {
  return PasswordResetToken.reconstitute({
    id: 't-1',
    userId: 'u-1',
    tokenHash: hashOpaqueToken(RAW_TOKEN),
    expiresAt: new Date(Date.now() + 60_000),
    usedAt: null,
    ...overrides,
  });
}

function setup(overrides: { token?: PasswordResetToken | null; user?: User | null } = {}) {
  const resetTokens: jest.Mocked<PasswordResetTokenRepositoryPort> = {
    save: jest.fn(),
    findByHash: jest
      .fn()
      .mockResolvedValue(overrides.token === undefined ? usableToken() : overrides.token),
    markUsed: jest.fn().mockResolvedValue(undefined),
  };
  const users: jest.Mocked<UserRepositoryPort> = {
    findByEmail: jest.fn(),
    findById: jest
      .fn()
      .mockResolvedValue(overrides.user === undefined ? activeUser : overrides.user),
    updatePasswordHash: jest.fn().mockResolvedValue(undefined),
    create: jest.fn(),
  };
  const hasher: jest.Mocked<PasswordHasherPort> = {
    hash: jest.fn().mockResolvedValue('new-hash'),
    verify: jest.fn(),
  };

  const useCase = new ConfirmResetUseCase(resetTokens, users, hasher);
  return { useCase, resetTokens, users, hasher };
}

describe('ConfirmResetUseCase (TASK-009, CON-004, AC-020, R9)', () => {
  it('AC-020: a valid unexpired token changes the password and marks the token used', async () => {
    const { useCase, resetTokens, users, hasher } = setup();

    await useCase.execute(RAW_TOKEN, 'new-password-123');

    expect(hasher.hash).toHaveBeenCalledWith('new-password-123');
    expect(users.updatePasswordHash).toHaveBeenCalledWith('u-1', 'new-hash');
    expect(resetTokens.markUsed).toHaveBeenCalledWith('t-1', expect.any(Date));
  });

  it('an unknown token → RESET_TOKEN_INVALID', async () => {
    const { useCase, users } = setup({ token: null });
    await expect(useCase.execute(RAW_TOKEN, 'new-password-123')).rejects.toBeInstanceOf(
      ResetTokenInvalidError,
    );
    expect(users.updatePasswordHash).not.toHaveBeenCalled();
  });

  it('AC-020: an already-used token → RESET_TOKEN_INVALID', async () => {
    const { useCase, users } = setup({ token: usableToken({ usedAt: new Date('2026-01-01') }) });
    await expect(useCase.execute(RAW_TOKEN, 'new-password-123')).rejects.toBeInstanceOf(
      ResetTokenInvalidError,
    );
    expect(users.updatePasswordHash).not.toHaveBeenCalled();
  });

  it('AC-020: an expired token → RESET_TOKEN_INVALID', async () => {
    const { useCase, users } = setup({
      token: usableToken({ expiresAt: new Date(Date.now() - 1) }),
    });
    await expect(useCase.execute(RAW_TOKEN, 'new-password-123')).rejects.toBeInstanceOf(
      ResetTokenInvalidError,
    );
    expect(users.updatePasswordHash).not.toHaveBeenCalled();
  });

  it('a token for a deactivated/deleted user → RESET_TOKEN_INVALID', async () => {
    const { useCase, resetTokens } = setup({ user: null });
    await expect(useCase.execute(RAW_TOKEN, 'new-password-123')).rejects.toBeInstanceOf(
      ResetTokenInvalidError,
    );
    expect(resetTokens.markUsed).not.toHaveBeenCalled();
  });
});
