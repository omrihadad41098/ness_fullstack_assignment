import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LIMIT,
  MAX_LIMIT,
  MAX_QUERY_LENGTH,
  parseListQuery,
  parseSearchQuery,
} from '../../src/validation/query.js';
import { parseObjectId } from '../../src/validation/ids.js';
import { AppError } from '../../src/http/errors.js';

describe('parseListQuery', () => {
  it('applies defaults for an empty query', () => {
    expect(parseListQuery({})).toEqual({ page: 1, limit: DEFAULT_LIMIT, kind: null });
  });

  it('parses valid values', () => {
    expect(parseListQuery({ page: '3', limit: '5', kind: 'image' })).toEqual({
      page: 3,
      limit: 5,
      kind: 'image',
    });
  });

  it('caps limit instead of rejecting it', () => {
    expect(parseListQuery({ limit: '500' }).limit).toBe(MAX_LIMIT);
  });

  it('treats blank values as unset', () => {
    expect(parseListQuery({ page: '', kind: '' })).toEqual({
      page: 1,
      limit: DEFAULT_LIMIT,
      kind: null,
    });
  });

  it('rejects non-positive, fractional and non-numeric paging', () => {
    for (const page of ['0', '-1', '1.5', 'abc']) {
      expect(() => parseListQuery({ page })).toThrow(/"page" must be a positive integer/);
    }
  });

  it('rejects repeated query parameters', () => {
    // Express parses ?page=1&page=2 into an array; treating it as a number would be silent nonsense.
    expect(() => parseListQuery({ page: ['1', '2'] })).toThrow(/"page" must be a single value/);
  });

  it('rejects an unknown kind with 400', () => {
    const error = catchError(() => parseListQuery({ kind: 'video' }));

    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).status).toBe(400);
  });
});

describe('parseSearchQuery', () => {
  it('trims the query and inherits the list defaults', () => {
    expect(parseSearchQuery({ q: '  black hair  ' })).toEqual({
      q: 'black hair',
      page: 1,
      limit: DEFAULT_LIMIT,
      kind: null,
    });
  });

  it('rejects a missing or blank query', () => {
    expect(() => parseSearchQuery({})).toThrow(/"q" is required/);
    expect(() => parseSearchQuery({ q: '   ' })).toThrow(/"q" must not be empty/);
  });

  it('rejects a repeated q parameter', () => {
    expect(() => parseSearchQuery({ q: ['a', 'b'] })).toThrow(/single value/);
  });

  it('rejects an over-long query instead of sending it to the database', () => {
    expect(() => parseSearchQuery({ q: 'x'.repeat(MAX_QUERY_LENGTH + 1) })).toThrow(
      /at most 200 characters/,
    );
  });

  it('keeps regex metacharacters, which the repository escapes rather than rejects', () => {
    expect(parseSearchQuery({ q: '.*' }).q).toBe('.*');
  });
});

describe('parseObjectId', () => {
  it('accepts a 24-character hex id', () => {
    expect(parseObjectId('507f1f77bcf86cd799439011').toString()).toBe('507f1f77bcf86cd799439011');
  });

  it('rejects the 12-character strings mongoose would accept', () => {
    // mongoose.isValidObjectId('abcdefghijkl') is true, which would turn a typo into a 404.
    expect(() => parseObjectId('abcdefghijkl')).toThrow(/24-character hex id/);
  });

  it('rejects wrong lengths, non-hex and non-strings', () => {
    for (const value of ['', '123', 'z07f1f77bcf86cd799439011', undefined, 42, null]) {
      expect(() => parseObjectId(value)).toThrow(AppError);
    }
  });

  it('names the field it rejected', () => {
    const error = catchError(() => parseObjectId('nope', 'assetId'));

    expect((error as AppError).message).toContain('"assetId"');
    expect((error as AppError).details).toEqual({ field: 'assetId' });
  });
});

function catchError(run: () => unknown): unknown {
  try {
    run();
    return null;
  } catch (err) {
    return err;
  }
}
