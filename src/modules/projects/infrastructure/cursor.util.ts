import { ValidationError } from '../../../shared-kernel/errors/domain-error';

/**
 * Opaque keyset-pagination cursor (TASK-011, CON-006). Encodes `(createdAt, id)` — the same pair
 * `findPage` orders and filters by — so a cursor round-trips exactly to "everything after this row".
 */
export interface CursorFields {
  readonly createdAt: Date;
  readonly id: string;
}

export function encodeCursor(fields: CursorFields): string {
  return Buffer.from(`${fields.createdAt.toISOString()}|${fields.id}`, 'utf8').toString('base64url');
}

export function decodeCursor(cursor: string): CursorFields {
  const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
  const [createdAt, id] = decoded.split('|');
  const parsedDate = createdAt ? new Date(createdAt) : null;
  if (!parsedDate || Number.isNaN(parsedDate.getTime()) || !id) {
    throw new ValidationError('Malformed pagination cursor.');
  }
  return { createdAt: parsedDate, id };
}
