/**
 * Typed domain-error hierarchy (TASK-003, FT-006, NFR-005; MOD-01 §2.1 F6).
 *
 * Deliberately framework-free: domain layers throw these (CLAUDE.md §5 — typed domain errors,
 * never raw strings) and the presentation layer maps them to HTTP via `DomainExceptionFilter`.
 * Each subclass self-describes its `httpStatus` as a plain number literal (never the
 * `HttpStatus` enum) precisely so a subclass living under a `domain/` folder can declare one
 * without importing `@nestjs/common` and failing the domain-purity check.
 *
 * `code` is a free-form string, not a closed enum — new modules add their own `DomainError`
 * subclasses with their own codes/statuses here is unnecessary; they simply extend `DomainError`
 * in their own module (TASK-003 non-goal: "no per-module error types" means don't grow this
 * shared list, not that modules can't mint their own codes).
 */
export abstract class DomainError extends Error {
  abstract readonly code: string;
  abstract readonly httpStatus: number;

  constructor(
    message: string,
    /** Optional machine-readable context, surfaced as `Error.details` in responses. */
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

/** The referenced resource does not exist — or must appear not to (anti-enumeration). */
export class NotFoundError extends DomainError {
  readonly code = 'NOT_FOUND';
  readonly httpStatus = 404;
}

/**
 * The caller lacks access. The default message matches MOD-01 §2.6 and must not disclose
 * whether the resource exists.
 */
export class ForbiddenError extends DomainError {
  readonly code = 'FORBIDDEN';
  readonly httpStatus = 403;

  constructor(
    message = 'You do not have access to this resource.',
    details?: Record<string, unknown>,
  ) {
    super(message, details);
  }
}

/** Input failed domain validation (business rules, beyond DTO shape checks). */
export class ValidationError extends DomainError {
  readonly code = 'VALIDATION';
  readonly httpStatus = 400;
}

/** The operation conflicts with current state (e.g. a duplicate unique value). */
export class ConflictError extends DomainError {
  readonly code = 'CONFLICT';
  readonly httpStatus = 409;
}

/** Understood but not executable under business rules. */
export class UnprocessableError extends DomainError {
  readonly code = 'UNPROCESSABLE';
  readonly httpStatus = 422;
}

/**
 * A project-scoped operation ran without a resolved project scope (MOD-01 §2.6, AC-005).
 * Thrown by the scope guard and by `TenantContext` itself, so an unscoped code path fails
 * before any query can touch a project-owned table.
 */
export class ScopeRequiredError extends DomainError {
  readonly code = 'SCOPE_REQUIRED';
  readonly httpStatus = 400;

  constructor(
    message = 'Project scope is required.',
    details?: Record<string, unknown>,
  ) {
    super(message, details);
  }
}

/** Not authenticated, or a previously-valid session is no longer usable (MOD-01/MOD-02 §2.6). */
export class UnauthenticatedError extends DomainError {
  readonly code = 'UNAUTHENTICATED';
  readonly httpStatus = 401;

  constructor(message = 'Authentication required.', details?: Record<string, unknown>) {
    super(message, details);
  }
}
