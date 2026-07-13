import { RefreshToken } from '../../domain/refresh-token.entity';

export interface RefreshTokenRepositoryPort {
  save(token: RefreshToken): Promise<void>;
  findByHash(tokenHash: string): Promise<RefreshToken | null>;
  /** Revokes exactly one token — the normal-rotation path (MOD-02 R2). */
  revokeById(id: string, revokedAt: Date): Promise<void>;
  /** Revokes every currently-unrevoked token in the family — the replay-detected path (AC-019). */
  revokeFamily(familyId: string, revokedAt: Date): Promise<void>;
}

export const REFRESH_TOKEN_REPOSITORY = 'RefreshTokenRepositoryPort';
