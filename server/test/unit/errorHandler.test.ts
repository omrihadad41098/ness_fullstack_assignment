import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler, notFoundHandler } from '../../src/http/middleware/errorHandler.js';
import { AppError } from '../../src/http/errors.js';
import type { ErrorResponse } from '../../src/types/api.js';
import { fakeNext, fakeRequest, fakeResponse } from './testDoubles.js';

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('errorHandler', () => {
  it('maps an AppError to the documented error shape', () => {
    const res = fakeResponse();

    errorHandler(
      new AppError('VALIDATION_ERROR', 'q must not be empty', { field: 'q' }),
      fakeRequest({ requestId: 'req-42' }),
      res,
      fakeNext(),
    );

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'q must not be empty',
        details: { field: 'q' },
        requestId: 'req-42',
      },
    } satisfies ErrorResponse);
  });

  it('omits details when the AppError has none', () => {
    const res = fakeResponse();

    errorHandler(new AppError('NOT_FOUND', 'asset not found'), fakeRequest(), res, fakeNext());

    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({
      error: { code: 'NOT_FOUND', message: 'asset not found', requestId: 'req-1' },
    });
  });

  it('never leaks the message of an unknown error', () => {
    const res = fakeResponse();

    errorHandler(new Error('connect ECONNREFUSED 127.0.0.1:27017'), fakeRequest(), res, fakeNext());

    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({
      error: { code: 'INTERNAL', message: 'Internal server error', requestId: 'req-1' },
    });
    expect(JSON.stringify(res.body)).not.toContain('27017');
  });
});

describe('notFoundHandler', () => {
  it('names the full URL, not the router-relative path', () => {
    const next = fakeNext();

    notFoundHandler(
      fakeRequest({ method: 'POST', path: '/nope', originalUrl: '/api/nope' }),
      fakeResponse(),
      next,
    );

    expect(next).toHaveBeenCalledTimes(1);
    const error: unknown = vi.mocked(next).mock.calls[0]?.[0];
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe('NOT_FOUND');
    expect((error as AppError).message).toBe('No route for POST /api/nope');
  });
});
