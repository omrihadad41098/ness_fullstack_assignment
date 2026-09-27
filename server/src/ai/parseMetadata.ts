import { AppError } from '../http/errors.js';
import type { AssetMetadata } from './aiProvider.js';

export const MAX_TAGS = 15;
export const MAX_TAG_LENGTH = 60;
export const MAX_DESCRIPTION_LENGTH = 1_000;
export const MAX_EXTRACTED_TEXT_CHARS = 50_000;

/**
 * The trust boundary around the model: LLM output is untrusted input, so it is validated and
 * normalised by hand rather than cast. Anything unusable throws, which marks the asset `failed`
 * instead of storing junk that would pollute the search index.
 */
export function parseMetadata(raw: unknown): AssetMetadata {
  const value = typeof raw === 'string' ? parseJson(raw) : raw;

  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new AppError('INTERNAL', 'AI response was not a JSON object');
  }
  const record = value as Record<string, unknown>;

  const description = normaliseDescription(record.description);
  const tags = normaliseTerms(record.tags);
  const keywords = normaliseTerms(record.keywords);
  if (description === '' && tags.length === 0 && keywords.length === 0) {
    throw new AppError('INTERNAL', 'AI response contained no usable metadata');
  }

  return {
    description,
    tags,
    keywords,
    extractedText: normaliseExtractedText(record.extractedText),
  };
}

function parseJson(raw: string): unknown {
  // Models sometimes wrap JSON in ```json fences even when asked not to.
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  try {
    return JSON.parse(cleaned);
  } catch {
    throw new AppError('INTERNAL', 'AI response was not valid JSON');
  }
}

function normaliseDescription(value: unknown): string {
  if (typeof value !== 'string') return '';
  return collapseWhitespace(value).slice(0, MAX_DESCRIPTION_LENGTH);
}

/** Lowercased, trimmed, de-duplicated, capped — so tag weighting is not skewed by repeats. */
function normaliseTerms(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== 'string') continue;
    const term = collapseWhitespace(entry).toLowerCase().slice(0, MAX_TAG_LENGTH);
    if (term === '') continue;
    seen.add(term);
    if (seen.size >= MAX_TAGS) break;
  }
  return [...seen];
}

function normaliseExtractedText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim().slice(0, MAX_EXTRACTED_TEXT_CHARS);
  return text === '' ? null : text;
}

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}
