export class TroveError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number = 400,
  ) {
    super(message);
  }
}

export class NotFoundError extends TroveError {
  constructor(message = "Not found") {
    super("NOT_FOUND", message, 404);
  }
}

export class UnauthorizedError extends TroveError {
  constructor(message = "Unauthorised") {
    super("UNAUTHORIZED", message, 401);
  }
}

export class ValidationError extends TroveError {
  constructor(message: string) {
    super("VALIDATION_ERROR", message, 400);
  }
}

export class DuplicateUrlError extends TroveError {
  constructor() {
    super("DUPLICATE_URL", "URL already exists in your library", 409);
  }
}

export class ForbiddenError extends TroveError {
  constructor(message = "Forbidden") {
    super("FORBIDDEN", message, 403);
  }
}
