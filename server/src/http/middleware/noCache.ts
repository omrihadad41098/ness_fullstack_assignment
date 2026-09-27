import type { RequestHandler } from 'express';

/**
 * Hard project constraint: every API response is computed fresh from MongoDB.
 * `no-store` also stops browsers replaying a stale asset list after an upload.
 */
export const noCache: RequestHandler = (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
};
