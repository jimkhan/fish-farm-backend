/**
 * Access-token (JWT) issuance/verification port (TASK-008, ADR-005, R3). Claims carry `sub`
 * only — never role or project (AC-018); role/project are resolved server-side per request by
 * MOD-01's tenant guard, never asserted by the token.
 */
export interface IssuedAccessToken {
  readonly token: string;
  readonly expiresInSeconds: number;
}

export interface VerifiedAccessToken {
  readonly sub: string;
}

export interface AccessTokenIssuerPort {
  issue(userId: string): IssuedAccessToken;
  /** Returns the verified claims, or `null` for a missing/expired/invalid-signature token. */
  verify(token: string): VerifiedAccessToken | null;
}

export const ACCESS_TOKEN_ISSUER = 'AccessTokenIssuerPort';
