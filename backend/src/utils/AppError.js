/**
 * Operational error with an HTTP status and a stable machine-readable code.
 * Thrown from services/controllers and rendered by the central error handler.
 */
export class AppError extends Error {
  constructor(message, { status = 400, code = 'BAD_REQUEST', details } = {}) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  static badRequest(message, code = 'BAD_REQUEST', details) {
    return new AppError(message, { status: 400, code, details });
  }

  static unauthorized(message = 'Authentication required', code = 'UNAUTHORIZED') {
    return new AppError(message, { status: 401, code });
  }

  static forbidden(
    message = 'You do not have permission to perform this action',
    code = 'FORBIDDEN',
  ) {
    return new AppError(message, { status: 403, code });
  }

  static notFound(message = 'Resource not found', code = 'NOT_FOUND') {
    return new AppError(message, { status: 404, code });
  }

  static conflict(message, code = 'CONFLICT', details) {
    return new AppError(message, { status: 409, code, details });
  }
}
