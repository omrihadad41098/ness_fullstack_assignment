import { describe, expect, it } from 'vitest';
import { AppError, isAppError } from '../../src/http/errors.js';

describe('AppError', () => {
  it('maps each code to its documented HTTP status', () => {
    expect(new AppError('VALIDATION_ERROR', 'bad').status).toBe(400);
    expect(new AppError('NOT_FOUND', 'missing').status).toBe(404);
    expect(new AppError('FILE_TOO_LARGE', 'big').status).toBe(413);
    expect(new AppError('UNSUPPORTED_FILE_TYPE', 'nope').status).toBe(415);
    expect(new AppError('AI_UNAVAILABLE', 'down').status).toBe(503);
    expect(new AppError('INTERNAL', 'boom').status).toBe(500);
  });

  it('keeps optional details', () => {
    const error = new AppError('VALIDATION_ERROR', 'bad query', { field: 'q' });

    expect(error.details).toEqual({ field: 'q' });
    expect(new AppError('NOT_FOUND', 'missing').details).toBeUndefined();
  });

  it('is recognised by isAppError and not confused with plain errors', () => {
    expect(isAppError(new AppError('NOT_FOUND', 'missing'))).toBe(true);
    expect(isAppError(new Error('missing'))).toBe(false);
    expect(isAppError('missing')).toBe(false);
  });
});
