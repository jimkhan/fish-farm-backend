/**
 * Password hashing port (TASK-008, MOD-02 R1). The concrete implementation uses argon2id
 * (`infrastructure/argon2-password-hasher.ts`) — this interface stays framework-free so
 * use-cases depend on an abstraction, not the hashing library directly.
 */
export interface PasswordHasherPort {
  hash(plain: string): Promise<string>;

  /**
   * Verifies `plain` against `hash`. Pass `null` when no user/hash exists (e.g. unknown email)
   * — implementations still perform a real verify against an internal dummy hash and always
   * return `false`, so response timing doesn't leak whether the account exists (AC-016,
   * MOD-02 §4.4 "constant-time").
   */
  verify(hash: string | null, plain: string): Promise<boolean>;
}

export const PASSWORD_HASHER = 'PasswordHasherPort';
