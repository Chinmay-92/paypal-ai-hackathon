export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

/** Also used for records outside the caller's tenant, so existence is not disclosed. */
export class NotFoundError extends AppError {
  constructor(what: string) {
    super(404, "NOT_FOUND", `${what} not found`);
  }
}

export class UnauthenticatedError extends AppError {
  constructor(message = "Sign in required") {
    super(401, "UNAUTHENTICATED", message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "You do not have access to this action") {
    super(403, "FORBIDDEN", message);
  }
}

/** Stale version, stale revision or an action the current state does not allow. */
export class ConflictError extends AppError {
  constructor(message: string, details?: unknown) {
    super(409, "CONFLICT", message, details);
  }
}

export class UnprocessableError extends AppError {
  constructor(message: string, details?: unknown) {
    super(422, "UNPROCESSABLE", message, details);
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(message: string) {
    super(503, "UNAVAILABLE", message);
  }
}
