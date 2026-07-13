import { createHash, randomBytes, randomUUID } from 'node:crypto';

/**
 * Opaque-secret utilities for refresh tokens (TASK-008, MOD-02 R2/R9). Deliberately distinct
 * from `PasswordHasherPort` (argon2id — slow, salted, verify-only): a refresh token must be
 * looked up by exact hash equality (`WHERE token_hash = ...`), which argon2's per-call random
 * salt makes impossible. SHA-256 here is a fast, deterministic lookup key, not a password hash.
 */

/** A cryptographically random opaque token — the raw secret handed to the client once. */
export function generateOpaqueToken(): string {
  return randomBytes(32).toString('hex');
}

/** Deterministic digest stored server-side; the raw token is never persisted. */
export function hashOpaqueToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

/** A new rotation-family id (MOD-02 R2) — a plain random id, not a token itself. */
export function generateFamilyId(): string {
  return randomUUID();
}
