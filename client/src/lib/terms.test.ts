import { describe, expect, it } from 'vitest';
import { limitTerms, uniqueTags } from './terms';

describe('uniqueTags', () => {
  it('returns the tags in order', () => {
    expect(uniqueTags({ tags: ['black hair', 'portrait'] })).toEqual(['black hair', 'portrait']);
  });

  it('drops repeats ignoring case and surrounding spaces', () => {
    expect(uniqueTags({ tags: ['Cat', ' cat ', 'black'] })).toEqual(['Cat', 'black']);
  });

  it('skips blank tags', () => {
    expect(uniqueTags({ tags: ['', '  ', 'cat'] })).toEqual(['cat']);
  });

  it('returns nothing while an asset has not been analysed yet', () => {
    expect(uniqueTags({ tags: [] })).toEqual([]);
  });
});

describe('limitTerms', () => {
  const tags = ['a1', 'b2', 'c3', 'd4', 'e5'];

  it('keeps the first N and counts the rest', () => {
    const { shown, hiddenCount } = limitTerms(tags, 3);
    expect(shown).toEqual(['a1', 'b2', 'c3']);
    expect(hiddenCount).toBe(2);
  });

  it('reports nothing hidden when everything fits', () => {
    expect(limitTerms(tags, 10).hiddenCount).toBe(0);
  });
});
