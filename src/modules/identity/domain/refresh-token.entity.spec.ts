import { RefreshToken } from './refresh-token.entity';

const baseProps = {
  id: 't-1',
  userId: 'u-1',
  familyId: 'f-1',
  tokenHash: 'hash',
};

describe('RefreshToken (TASK-008, MOD-02 R2)', () => {
  it('is usable when neither revoked nor expired', () => {
    const token = RefreshToken.reconstitute({
      ...baseProps,
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
    });
    expect(token.isRevoked).toBe(false);
    expect(token.isExpired).toBe(false);
    expect(token.isUsable).toBe(true);
  });

  it('is not usable once revoked', () => {
    const token = RefreshToken.reconstitute({
      ...baseProps,
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: new Date(),
    });
    expect(token.isRevoked).toBe(true);
    expect(token.isUsable).toBe(false);
  });

  it('is not usable once expired', () => {
    const token = RefreshToken.reconstitute({
      ...baseProps,
      expiresAt: new Date(Date.now() - 1),
      revokedAt: null,
    });
    expect(token.isExpired).toBe(true);
    expect(token.isUsable).toBe(false);
  });
});
