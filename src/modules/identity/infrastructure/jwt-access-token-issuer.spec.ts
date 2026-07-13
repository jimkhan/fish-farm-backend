import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { JwtAccessTokenIssuer } from './jwt-access-token-issuer';

function setup(overrides: { ttl?: number } = {}) {
  const jwt = new JwtService({ secret: 'a'.repeat(32) });
  const config = {
    get: jest.fn().mockReturnValue(overrides.ttl ?? 900),
  } as unknown as ConfigService;
  return new JwtAccessTokenIssuer(jwt, config as never);
}

describe('JwtAccessTokenIssuer (TASK-008, ADR-005, AC-018)', () => {
  it('issue() returns a JWT and the configured TTL', () => {
    const issuer = setup({ ttl: 900 });
    const { token, expiresInSeconds } = issuer.issue('user-1');

    expect(typeof token).toBe('string');
    expect(token.split('.')).toHaveLength(3); // header.payload.signature
    expect(expiresInSeconds).toBe(900);
  });

  it('AC-018: the payload contains sub and only the standard iat/exp claims — no role or project', () => {
    const issuer = setup();
    const { token } = issuer.issue('user-1');
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());

    expect(payload.sub).toBe('user-1');
    expect(Object.keys(payload).sort()).toEqual(['exp', 'iat', 'sub']);
  });

  it('verify() round-trips a token it issued', () => {
    const issuer = setup();
    const { token } = issuer.issue('user-1');
    expect(issuer.verify(token)).toEqual({ sub: 'user-1' });
  });

  it('verify() returns null for a garbage token', () => {
    const issuer = setup();
    expect(issuer.verify('not.a.jwt')).toBeNull();
  });

  it('verify() returns null for a token signed with a different secret', () => {
    const issuer = setup();
    const otherIssuer = new JwtAccessTokenIssuer(
      new JwtService({ secret: 'b'.repeat(32) }),
      { get: jest.fn().mockReturnValue(900) } as unknown as ConfigService<never, true>,
    );
    const { token } = otherIssuer.issue('user-1');
    expect(issuer.verify(token)).toBeNull();
  });

  it('verify() returns null for an expired token', () => {
    const jwt = new JwtService({ secret: 'a'.repeat(32) });
    const config = { get: jest.fn().mockReturnValue(-1) } as unknown as ConfigService; // already-expired TTL
    const issuer = new JwtAccessTokenIssuer(jwt, config as never);
    const { token } = issuer.issue('user-1');
    expect(issuer.verify(token)).toBeNull();
  });
});
