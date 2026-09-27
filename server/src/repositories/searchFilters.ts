import type { QueryFilter } from 'mongoose';
import type { AssetRecord } from '../models/asset.model.js';
import type { AssetKind } from '../types/api.js';

/** Mongoose 9 renamed `FilterQuery` to `QueryFilter`; aliased once so the intent stays readable. */
type AssetFilter = QueryFilter<AssetRecord>;

/**
 * Fields the regex fallback scans. `extractedText` is excluded: unindexed substring scans over
 * whole documents are the one thing here that would not scale.
 */
const REGEX_FIELDS = ['tags', 'keywords', 'description', 'originalName'] as const;

/**
 * Escapes every regex metacharacter so a query like `a.*b` or `(` is matched literally instead of
 * being executed as a pattern - the NoSQL equivalent of parameterising a SQL LIKE.
 */
export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Only `ready` assets are searchable: the others have no metadata to match on yet. */
function baseFilter(kind: AssetKind | null): AssetFilter {
  return kind === null ? { status: 'ready' } : { status: 'ready', kind };
}

/**
 * MongoDB's `$text` does the work: stemming ("documents" matches "document"), multi-term OR with
 * higher scores for documents matching more terms, and index weights that rank a tag hit above a
 * match buried in extracted text.
 */
export function buildTextFilter(q: string, kind: AssetKind | null): AssetFilter {
  return { ...baseFilter(kind), $text: { $search: q } };
}

/**
 * Fallback for what `$text` cannot do: partial words ("docu"), because a text index only matches
 * whole stemmed tokens. Every term must appear somewhere ($and of $or) so extra words narrow
 * rather than widen the result, matching what a user expects from a search box.
 */
export function buildRegexFilter(q: string, kind: AssetKind | null): AssetFilter {
  const terms = q.split(/\s+/).filter((term) => term !== '');
  if (terms.length === 0) return { ...baseFilter(kind), _id: null };

  return {
    ...baseFilter(kind),
    $and: terms.map((term) => {
      const pattern = new RegExp(escapeRegex(term), 'i');
      return { $or: REGEX_FIELDS.map((field) => ({ [field]: pattern })) };
    }),
  };
}
