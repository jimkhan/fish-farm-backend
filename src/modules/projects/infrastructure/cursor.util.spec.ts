import { ValidationError } from '../../../shared-kernel/errors/domain-error';
import { decodeCursor, encodeCursor } from './cursor.util';

describe('cursor.util (TASK-011, CON-006 keyset pagination)', () => {
  it('round-trips createdAt/id through encode/decode', () => {
    const createdAt = new Date('2026-01-01T00:00:00.000Z');
    const cursor = encodeCursor({ createdAt, id: 'p-1' });
    const decoded = decodeCursor(cursor);

    expect(decoded.id).toBe('p-1');
    expect(decoded.createdAt.toISOString()).toBe(createdAt.toISOString());
  });

  it('rejects a malformed cursor with a typed ValidationError', () => {
    expect(() => decodeCursor('not-a-real-cursor')).toThrow(ValidationError);
  });

  it('rejects a cursor with an unparseable date', () => {
    const garbage = Buffer.from('not-a-date|p-1', 'utf8').toString('base64url');
    expect(() => decodeCursor(garbage)).toThrow(ValidationError);
  });
});
