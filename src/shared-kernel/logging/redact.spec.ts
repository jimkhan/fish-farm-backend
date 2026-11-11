import { REDACTED, redact } from './redact';

describe('redact', () => {
  it('replaces sensitive keys at any depth, case-insensitively', () => {
    const out = redact({
      email: 'a@b.c',
      password: 'hunter2',
      nested: { refreshToken: 'abc', Authorization: 'Bearer x', ok: 1 },
      headers: { 'x-device-key': 'k', 'user-agent': 'ua' },
    }) as Record<string, unknown>;

    expect(out.email).toBe('a@b.c');
    expect(out.password).toBe(REDACTED);
    expect(out.nested).toEqual({ refreshToken: REDACTED, Authorization: REDACTED, ok: 1 });
    expect(out.headers).toEqual({ 'x-device-key': REDACTED, 'user-agent': 'ua' });
  });

  it('bounds size: long strings, long arrays, deep nesting', () => {
    const deep: Record<string, unknown> = {};
    let cursor = deep;
    for (let i = 0; i < 10; i++) {
      cursor.child = {};
      cursor = cursor.child as Record<string, unknown>;
    }
    const out = redact({
      s: 'x'.repeat(600),
      arr: Array.from({ length: 25 }, (_, i) => i),
      deep,
    }) as Record<string, unknown>;

    expect((out.s as string).length).toBe(513);
    expect((out.arr as unknown[]).length).toBe(21);
    expect((out.arr as unknown[])[20]).toBe('…+5 more');
    expect(JSON.stringify(out.deep)).toContain('[Truncated]');
  });

  it('passes through primitives and serialises dates/bigints/buffers', () => {
    expect(redact(42)).toBe(42);
    expect(redact(null)).toBeNull();
    expect(redact(10n)).toBe('10');
    expect(redact(new Date('2026-01-01T00:00:00Z'))).toBe('2026-01-01T00:00:00.000Z');
    expect(redact(Buffer.from('abc'))).toBe('[Buffer 3B]');
  });
});
