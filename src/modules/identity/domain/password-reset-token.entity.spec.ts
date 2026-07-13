import { PasswordResetToken } from './password-reset-token.entity';

const baseProps = {
  id: 't-1',
  userId: 'u-1',
  tokenHash: 'hash',
};

describe('PasswordResetToken (TASK-009, MOD-02 R9)', () => {
  it('is usable when neither used nor expired', () => {
    const token = PasswordResetToken.reconstitute({
      ...baseProps,
      expiresAt: new Date(Date.now() + 60_000),
      usedAt: null,
    });
    expect(token.isUsed).toBe(false);
    expect(token.isExpired).toBe(false);
    expect(token.isUsable).toBe(true);
  });

  it('is not usable once used', () => {
    const token = PasswordResetToken.reconstitute({
      ...baseProps,
      expiresAt: new Date(Date.now() + 60_000),
      usedAt: new Date(),
    });
    expect(token.isUsed).toBe(true);
    expect(token.isUsable).toBe(false);
  });

  it('is not usable once expired', () => {
    const token = PasswordResetToken.reconstitute({
      ...baseProps,
      expiresAt: new Date(Date.now() - 1),
      usedAt: null,
    });
    expect(token.isExpired).toBe(true);
    expect(token.isUsable).toBe(false);
  });
});
