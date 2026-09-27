import { AppError } from '../http/errors.js';
import type { AssetKind } from '../types/api.js';

export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 50;
export const MAX_QUERY_LENGTH = 200;

export type ListParams = {
  page: number;
  limit: number;
  kind: AssetKind | null;
};

export type SearchParams = ListParams & { q: string };

type RawQuery = Record<string, unknown>;

export function parseListQuery(query: RawQuery): ListParams {
  return {
    page: parsePositiveInt(query.page, 'page', 1),
    limit: Math.min(parsePositiveInt(query.limit, 'limit', DEFAULT_LIMIT), MAX_LIMIT),
    kind: parseKind(query.kind),
  };
}

export function parseSearchQuery(query: RawQuery): SearchParams {
  return { ...parseListQuery(query), q: parseSearchTerm(query.q) };
}

function parseSearchTerm(value: unknown): string {
  if (typeof value !== 'string') {
    // Also catches `?q=a&q=b`, which Express turns into an array.
    throw new AppError('VALIDATION_ERROR', '"q" is required and must be a single value', {
      field: 'q',
    });
  }
  const q = value.trim();
  if (q === '') {
    throw new AppError('VALIDATION_ERROR', '"q" must not be empty', { field: 'q' });
  }
  if (q.length > MAX_QUERY_LENGTH) {
    throw new AppError('VALIDATION_ERROR', `"q" must be at most ${MAX_QUERY_LENGTH} characters`, {
      field: 'q',
    });
  }
  return q;
}

export function parseKind(value: unknown): AssetKind | null {
  if (value === undefined || value === '') return null;
  if (value === 'image' || value === 'text') return value;
  throw new AppError('VALIDATION_ERROR', '"kind" must be "image" or "text"', { field: 'kind' });
}

export function parsePositiveInt(value: unknown, field: string, fallback: number): number {
  if (value === undefined || value === '') return fallback;
  if (typeof value !== 'string') {
    throw new AppError('VALIDATION_ERROR', `"${field}" must be a single value`, { field });
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new AppError('VALIDATION_ERROR', `"${field}" must be a positive integer`, { field });
  }
  return parsed;
}
