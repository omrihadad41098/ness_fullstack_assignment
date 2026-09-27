import type { Asset } from '../api/types';

/** The AI's tags with blanks and case-insensitive repeats dropped. Keywords are search-only. */
export function uniqueTags(asset: Pick<Asset, 'tags'>): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const raw of asset.tags) {
    const label = raw.trim();
    const key = label.toLowerCase();
    if (key === '' || seen.has(key)) continue;
    seen.add(key);
    tags.push(label);
  }
  return tags;
}

/** Keeps a card to a couple of lines; the detail page shows the full list. */
export function limitTerms(terms: string[], limit: number): { shown: string[]; hiddenCount: number } {
  return { shown: terms.slice(0, limit), hiddenCount: Math.max(0, terms.length - limit) };
}
