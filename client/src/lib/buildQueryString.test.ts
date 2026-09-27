import { describe, expect, it } from 'vitest';
import { buildQueryString } from './buildQueryString';

describe('buildQueryString', () => {
  it('returns an empty string when nothing is set', () => {
    expect(buildQueryString({})).toBe('');
    expect(buildQueryString({ q: '', kind: undefined, page: null })).toBe('');
  });

  it('keeps only non-empty values', () => {
    expect(buildQueryString({ q: 'black hair', kind: '', page: 2 })).toBe('?q=black+hair&page=2');
  });

  it('trims strings and encodes special characters', () => {
    expect(buildQueryString({ q: '  a&b=c  ' })).toBe('?q=a%26b%3Dc');
  });

  it('keeps zero, which is a real value', () => {
    expect(buildQueryString({ page: 0 })).toBe('?page=0');
  });
});
