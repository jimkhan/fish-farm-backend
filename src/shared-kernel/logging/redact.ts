/**
 * Field-level redaction for anything that ends up in a log line (NFR-005: no secrets or
 * credentials in logs). Matching is by key name, case-insensitive, at any depth. Values are
 * never inspected — a password is a password whatever it looks like.
 */
const SENSITIVE_KEY =
  /password|passwd|secret|token|authorization|cookie|api[-_]?key|x-device-key|credential|otp/i;

export const REDACTED = '[REDACTED]';

const MAX_DEPTH = 6;
const MAX_ARRAY_ITEMS = 20;
const MAX_STRING_LENGTH = 512;

/**
 * Returns a copy of `value` safe to log: sensitive keys replaced, deep/large structures
 * truncated so a single request can never emit an unbounded log line.
 */
export function redact(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') {
    return value.length > MAX_STRING_LENGTH ? `${value.slice(0, MAX_STRING_LENGTH)}…` : value;
  }
  if (typeof value === 'bigint') return value.toString();
  if (typeof value !== 'object') return value;
  if (depth >= MAX_DEPTH) return '[Truncated]';
  if (value instanceof Date) return value.toISOString();
  if (Buffer.isBuffer(value)) return `[Buffer ${value.byteLength}B]`;

  if (Array.isArray(value)) {
    const items = value.slice(0, MAX_ARRAY_ITEMS).map((item) => redact(item, depth + 1));
    if (value.length > MAX_ARRAY_ITEMS) items.push(`…+${value.length - MAX_ARRAY_ITEMS} more`);
    return items;
  }

  const out: Record<string, unknown> = {};
  for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
    out[key] = SENSITIVE_KEY.test(key) ? REDACTED : redact(inner, depth + 1);
  }
  return out;
}
