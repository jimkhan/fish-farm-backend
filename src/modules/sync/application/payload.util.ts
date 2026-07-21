import { ValidationError } from '../../../shared-kernel/errors/domain-error';

/**
 * `SyncRequest.mutations[].payload` is intentionally unstructured in the contract
 * (`additionalProperties: true`, module doc §4.7) — each entity's own domain use-case already
 * re-validates business rules (e.g. `qtyKg > 0`), so these helpers only need to guard the
 * *shape* at the dispatch boundary, not duplicate that validation.
 */
export function requireString(payload: Record<string, unknown>, key: string): string {
  const value = payload[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new ValidationError(`"${key}" is required.`);
  }
  return value;
}

export function optionalString(payload: Record<string, unknown>, key: string): string | undefined {
  const value = payload[key];
  return typeof value === 'string' ? value : undefined;
}

export function requireNumber(payload: Record<string, unknown>, key: string): number {
  const value = payload[key];
  if (typeof value !== 'number' || Number.isNaN(value)) {
    throw new ValidationError(`"${key}" is required.`);
  }
  return value;
}

export function requireDate(payload: Record<string, unknown>, key: string): Date {
  const raw = requireString(payload, key);
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    throw new ValidationError(`"${key}" must be a valid date.`);
  }
  return date;
}

export function requireEnum<T extends string>(
  payload: Record<string, unknown>,
  key: string,
  allowed: readonly T[],
): T {
  const value = requireString(payload, key);
  if (!(allowed as readonly string[]).includes(value)) {
    throw new ValidationError(`"${key}" must be one of ${allowed.join(', ')}.`);
  }
  return value as T;
}

export function optionalEnum<T extends string>(
  payload: Record<string, unknown>,
  key: string,
  allowed: readonly T[],
): T | undefined {
  const value = optionalString(payload, key);
  if (value === undefined) {
    return undefined;
  }
  if (!(allowed as readonly string[]).includes(value)) {
    throw new ValidationError(`"${key}" must be one of ${allowed.join(', ')}.`);
  }
  return value as T;
}
