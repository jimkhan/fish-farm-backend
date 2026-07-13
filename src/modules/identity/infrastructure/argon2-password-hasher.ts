import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import { PasswordHasherPort } from '../application/ports/password-hasher.port';

const DUMMY_PASSWORD = 'dummy-password-for-constant-time-comparison';

/** argon2id password hashing (TASK-008, MOD-02 R1, AC-017). Plaintext is never logged. */
@Injectable()
export class Argon2PasswordHasher implements PasswordHasherPort {
  private dummyHashPromise: Promise<string> | null = null;

  async hash(plain: string): Promise<string> {
    return argon2.hash(plain, { type: argon2.argon2id });
  }

  async verify(hash: string | null, plain: string): Promise<boolean> {
    if (hash === null) {
      // Still perform a full verify (against a fixed dummy hash) so timing doesn't disclose
      // that the account doesn't exist (AC-016). The result is discarded — always false.
      await argon2.verify(await this.getDummyHash(), plain).catch(() => false);
      return false;
    }
    try {
      return await argon2.verify(hash, plain);
    } catch {
      return false;
    }
  }

  private getDummyHash(): Promise<string> {
    this.dummyHashPromise ??= argon2.hash(DUMMY_PASSWORD, { type: argon2.argon2id });
    return this.dummyHashPromise;
  }
}
