import type { ErrorRequestHandler, RequestHandler } from 'express';
import { AppError, isAppError } from '../errors.js';
import { log } from '../../logger.js';
import type { ErrorResponse } from '../../types/api.js';

// originalUrl, not path: inside a mounted router `path` is relative to the mount point.
export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new AppError('NOT_FOUND', `No route for ${req.method} ${req.originalUrl}`));
};

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const requestId = req.requestId ?? 'unknown';

  if (isAppError(err)) {
    log.warn(
      { requestId, code: err.code, status: err.status, path: req.originalUrl },
      'request failed with AppError',
    );
    const body: ErrorResponse = {
      error: {
        code: err.code,
        message: err.message,
        requestId,
        ...(err.details === undefined ? {} : { details: err.details }),
      },
    };
    res.status(err.status).json(body);
    return;
  }

  // Unknown errors may carry internal details (driver messages, paths) — log, never return.
  log.error(
    { requestId, path: req.originalUrl, err: err instanceof Error ? err.stack : String(err) },
    'unhandled error',
  );
  const body: ErrorResponse = {
    error: { code: 'INTERNAL', message: 'Internal server error', requestId },
  };
  res.status(500).json(body);
};
