import { Argon2PasswordHasher } from './argon2-password-hasher';

describe('Argon2PasswordHasher (TASK-008, MOD-02 R1, AC-016/017)', () => {
  it('hash() produces an argon2id hash a correct password verifies against', async () => {
    const hasher = new Argon2PasswordHasher();
    const hash = await hasher.hash('correct horse battery staple');

    expect(hash.startsWith('$argon2id$')).toBe(true);
    await expect(hasher.verify(hash, 'correct horse battery staple')).resolves.toBe(true);
  });

  it('verify() rejects the wrong password', async () => {
    const hasher = new Argon2PasswordHasher();
    const hash = await hasher.hash('correct horse battery staple');
    await expect(hasher.verify(hash, 'wrong password')).resolves.toBe(false);
  });

  it('verify(null, ...) always resolves false (unknown-account path)', async () => {
    const hasher = new Argon2PasswordHasher();
    await expect(hasher.verify(null, 'anything')).resolves.toBe(false);
  });

  it('verify(null, ...) takes comparable time to a real verify — no early-return short-circuit (AC-016 constant-time defense)', async () => {
    // Argon2's native bindings can't be jest.spyOn'd (non-configurable exports), so this proves
    // the behavioral guarantee (LoginUseCase's own test proves the call always happens) another
    // way: a null-hash verify must cost roughly as much as a real one, not return near-instantly.
    const hasher = new Argon2PasswordHasher();
    const hash = await hasher.hash('correct horse battery staple');

    const realStart = Date.now();
    await hasher.verify(hash, 'wrong password');
    const realDurationMs = Date.now() - realStart;

    const nullStart = Date.now();
    await hasher.verify(null, 'anything');
    const nullDurationMs = Date.now() - nullStart;

    // Generous bound: a short-circuit would be sub-millisecond; a real verify is tens of ms.
    expect(nullDurationMs).toBeGreaterThan(realDurationMs / 4);
  });

  it('verify() with a malformed hash resolves false instead of throwing', async () => {
    const hasher = new Argon2PasswordHasher();
    await expect(hasher.verify('not-a-real-hash', 'anything')).resolves.toBe(false);
  });
});
