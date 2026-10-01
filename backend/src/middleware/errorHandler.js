import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { env } from '../config/env.js';
import { AppError } from '../utils/AppError.js';
import { uniqueTarget } from '../utils/records.js';

/** Map known library errors onto AppError so clients always get a stable code. */
function normalize(err) {
  if (err instanceof AppError) return err;

  if (err instanceof ZodError) {
    return new AppError('Validation failed', {
      status: 400,
      code: 'VALIDATION_ERROR',
      details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      return AppError.conflict(
        'A record with the same unique value already exists',
        'DUPLICATE_RECORD',
        { target: uniqueTarget(err) },
      );
    }
    if (err.code === 'P2025') return AppError.notFound('Record not found', 'RECORD_NOT_FOUND');
    if (err.code === 'P2003') {
      return AppError.badRequest('Referenced record does not exist', 'INVALID_REFERENCE');
    }
  }

  if (err instanceof Prisma.PrismaClientInitializationError) {
    return new AppError('Database is unavailable', { status: 503, code: 'DATABASE_UNAVAILABLE' });
  }

  // body-parser errors from express.json()
  if (err?.type === 'entity.parse.failed') {
    return AppError.badRequest('Malformed JSON request body', 'INVALID_JSON');
  }
  if (err?.type === 'entity.too.large') {
    return new AppError('Request body too large', { status: 413, code: 'PAYLOAD_TOO_LARGE' });
  }

  return null;
}

// Express identifies error handlers by arity, so all four parameters are required.
export function errorHandler(err, req, res, _next) {
  const known = normalize(err);
  const status = known?.status ?? 500;

  if (status >= 500) {
    req.log?.error({ err }, 'Unhandled error');
  } else {
    req.log?.warn({ code: known.code, message: known.message }, 'Request failed');
  }

  const body = {
    success: false,
    message: known?.message ?? 'An unexpected error occurred',
    code: known?.code ?? 'INTERNAL_ERROR',
  };
  if (known?.details) body.details = known.details;
  if (req.id) body.requestId = req.id;
  // Stack traces only outside production, and only for unexpected errors.
  if (!env.isProduction && !known) body.stack = err?.stack;

  res.status(status).json(body);
}
