import { describe, expect, it } from 'vitest';
import { createSearchService, matchedTags } from '../../src/services/searchService.js';
import { assetRecord, createFakeRepository } from './fakes.js';

describe('matchedTags', () => {
  it('reports which of the asset terms the query touched', () => {
    expect(matchedTags('black hair', ['black hair', 'portrait', 'studio'])).toEqual(['black hair']);
  });

  it('matches a partial query word against a longer term', () => {
    expect(matchedTags('docu', ['document', 'receipt'])).toEqual(['document']);
  });

  it('matches a plural query against a singular tag', () => {
    expect(matchedTags('documents', ['document'])).toEqual(['document']);
  });

  it('ignores short noise words that would match almost anything', () => {
    expect(matchedTags('a of', ['document'])).toEqual([]);
  });

  it('de-duplicates terms that appear in both tags and keywords', () => {
    expect(matchedTags('document', ['document', 'document'])).toEqual(['document']);
  });
});

describe('searchService', () => {
  const black = assetRecord({
    status: 'ready',
    kind: 'image',
    originalName: 'portrait.png',
    mimeType: 'image/png',
    tags: ['black hair'],
    keywords: ['person', 'portrait'],
  });
  const receipt = assetRecord({
    status: 'ready',
    kind: 'text',
    originalName: 'receipt.txt',
    tags: ['receipt'],
    keywords: ['document', 'paper'],
  });
  const pending = assetRecord({ status: 'pending', tags: ['black hair'] });

  const service = createSearchService(createFakeRepository([black, receipt, pending]));

  it('returns DTOs with the score and the terms that matched', async () => {
    const response = await service.search({ q: 'black hair', page: 1, limit: 20, kind: null });

    expect(response.query).toBe('black hair');
    expect(response.total).toBe(1);
    expect(response.results[0]?.asset.id).toBe(black._id.toString());
    expect(response.results[0]?.matchedTags).toEqual(['black hair']);
    expect(response.results[0]?.score).toBeGreaterThan(0);
  });

  it('finds a text file by a broad category keyword the AI added', async () => {
    const response = await service.search({ q: 'document', page: 1, limit: 20, kind: null });

    expect(response.results.map((result) => result.asset.originalName)).toEqual(['receipt.txt']);
    expect(response.results[0]?.matchedTags).toContain('document');
  });

  it('never leaks internal fields into results', async () => {
    const response = await service.search({ q: 'document', page: 1, limit: 20, kind: null });

    expect(response.results[0]?.asset).not.toHaveProperty('fileId');
    expect(response.results[0]?.asset).not.toHaveProperty('aiProvider');
  });

  it('returns an empty result set rather than failing when nothing matches', async () => {
    const response = await service.search({ q: 'submarine', page: 1, limit: 20, kind: null });

    expect(response).toEqual({ query: 'submarine', results: [], total: 0 });
  });
});
