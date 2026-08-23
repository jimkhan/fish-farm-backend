import { RefreshToken } from './refresh-token.entity';

const baseProps = {
  id: 't-1',
  userId: 'u-1',
  familyId: 'f-1',
  tokenHash: 'hash',
  rotatedAt: null,
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

  describe('wasRotatedWithin — the concurrent-refresh grace window', () => {
    const revokedProps = {
      ...baseProps,
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: new Date('2026-01-01T00:00:00Z'),
    };

    it('is true for a token rotated inside the window', () => {
      const now = new Date('2026-01-01T00:00:05Z');
      const token = RefreshToken.reconstitute({
        ...revokedProps,
        rotatedAt: new Date('2026-01-01T00:00:00Z'),
      });
      expect(token.wasRotatedWithin(10_000, now)).toBe(true);
    });

    it('is false once the window has passed — a genuine replay again', () => {
      const now = new Date('2026-01-01T00:00:30Z');
      const token = RefreshToken.reconstitute({
        ...revokedProps,
        rotatedAt: new Date('2026-01-01T00:00:00Z'),
      });
      expect(token.wasRotatedWithin(10_000, now)).toBe(false);
    });

    it('is false for a security revocation, however recent — a password reset or replay-detected family kill must never be undone', () => {
      const now = new Date('2026-01-01T00:00:01Z');
      const token = RefreshToken.reconstitute({ ...revokedProps, rotatedAt: null });
      expect(token.isRevoked).toBe(true);
      expect(token.wasRotatedWithin(10_000, now)).toBe(false);
    });
  });
});
