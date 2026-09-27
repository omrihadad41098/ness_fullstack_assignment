import { log } from '../logger.js';
import { toAssetDto } from './assetMapper.js';
import type { AssetRepository, SearchQuery } from '../repositories/assetRepository.js';
import type { SearchResponse } from '../types/api.js';

export type SearchService = {
  search(query: SearchQuery): Promise<SearchResponse>;
};

export function createSearchService(repository: AssetRepository): SearchService {
  return {
    async search(query) {
      const { results, total, strategy } = await repository.search(query);
      log.info({ q: query.q, strategy, total }, 'search executed');

      return {
        query: query.q,
        results: results.map(({ asset, score }) => ({
          asset: toAssetDto(asset),
          score,
        })),
        total,
      };
    },
  };
}

/**
 * Which of the asset's own terms the query touched, so the UI can show *why* a result matched.
 * This is presentation, not ranking — the order and the set of results are entirely MongoDB's.
 */
export function matchedTags(q: string, terms: string[]): string[] {
  const queryWords = tokenise(q);
  if (queryWords.length === 0) return [];

  const matched = terms.filter((term) => {
    const termWords = tokenise(term);
    return queryWords.some(
      (word) => termWords.some((part) => part.includes(word) || word.includes(part)),
      // Substring both ways so "docu" matches the tag "document" and "documents" matches "document".
    );
  });
  return [...new Set(matched)];
}

function tokenise(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 2);
}
