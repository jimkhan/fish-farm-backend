import { ConfigService } from '@nestjs/config';
import { User } from '../domain/user.entity';
import { PasswordResetNotifierPort } from './ports/password-reset-notifier.port';
import { PasswordResetTokenRepositoryPort } from './ports/password-reset-token-repository.port';
import { UserRepositoryPort } from './ports/user-repository.port';
import { RequestResetUseCase } from './request-reset.usecase';

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

function setup(overrides: { user?: User | null } = {}) {
  const users: jest.Mocked<UserRepositoryPort> = {
    findByEmail: jest.fn().mockResolvedValue(overrides.user ?? null),
    findById: jest.fn(),
    updatePasswordHash: jest.fn(),
    create: jest.fn(),
  };
  const resetTokens: jest.Mocked<PasswordResetTokenRepositoryPort> = {
    save: jest.fn().mockResolvedValue(undefined),
    findByHash: jest.fn(),
    markUsed: jest.fn(),
  };
  const notifier: jest.Mocked<PasswordResetNotifierPort> = {
    send: jest.fn().mockResolvedValue(undefined),
  };
  const config = { get: jest.fn().mockReturnValue(30) } as unknown as ConfigService;

  const useCase = new RequestResetUseCase(users, resetTokens, notifier, config as never);
  return { useCase, users, resetTokens, notifier };
}

describe('RequestResetUseCase (TASK-009, CON-003, AC-020)', () => {
  it('an active user gets a saved single-use token and a notification', async () => {
    const { useCase, resetTokens, notifier } = setup({ user: activeUser });

    await useCase.execute('owner@example.com');

    expect(resetTokens.save).toHaveBeenCalledTimes(1);
    const saved = resetTokens.save.mock.calls[0][0];
    expect(saved.userId).toBe('u-1');
    expect(saved.isUsable).toBe(true);
    expect(notifier.send).toHaveBeenCalledWith('owner@example.com', expect.any(String));
  });

  it('an unknown email resolves without creating a token or notifying (no enumeration)', async () => {
    const { useCase, resetTokens, notifier } = setup({ user: null });

    await expect(useCase.execute('nobody@example.com')).resolves.toBeUndefined();

    expect(resetTokens.save).not.toHaveBeenCalled();
    expect(notifier.send).not.toHaveBeenCalled();
  });

  it('a deactivated user resolves without creating a token or notifying (no enumeration)', async () => {
    const { useCase, resetTokens, notifier } = setup({ user: deactivatedUser });

    await expect(useCase.execute('gone@example.com')).resolves.toBeUndefined();

    expect(resetTokens.save).not.toHaveBeenCalled();
    expect(notifier.send).not.toHaveBeenCalled();
  });
});
