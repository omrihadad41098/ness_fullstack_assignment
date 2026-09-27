import { describe, expect, it } from 'vitest';
import { MAX_TAGS, parseMetadata } from '../../src/ai/parseMetadata.js';
import { AppError } from '../../src/http/errors.js';

describe('parseMetadata', () => {
  it('accepts a well-formed response', () => {
    const metadata = parseMetadata(
      JSON.stringify({
        title: 'Black hair',
        description: 'A woman with black hair.',
        tags: ['black hair', 'portrait'],
        keywords: ['person'],
        extractedText: 'HELLO',
      }),
    );

    expect(metadata).toEqual({
      title: 'Black hair',
      description: 'A woman with black hair.',
      tags: ['black hair', 'portrait'],
      keywords: ['person'],
      extractedText: 'HELLO',
    });
  });

  it('strips quotes and a trailing full stop from the title', () => {
    const metadata = parseMetadata({
      title: '"Black cat."',
      description: 'x',
      tags: ['a'],
      keywords: [],
    });

    expect(metadata.title).toBe('Black cat');
  });

  it('strips markdown fences the model was told not to add', () => {
    const metadata = parseMetadata('```json\n{"description":"x","tags":["a"],"keywords":[]}\n```');

    expect(metadata.description).toBe('x');
  });

  it('keeps multi-word tags intact so "black hair" stays searchable as a phrase', () => {
    const metadata = parseMetadata({ description: 'x', tags: ['Black  Hair'], keywords: [] });

    expect(metadata.tags).toEqual(['black hair']);
  });

  it('lowercases, trims, de-duplicates and caps terms', () => {
    const many = Array.from({ length: 40 }, (_, i) => `tag${i}`);
    const metadata = parseMetadata({
      description: 'x',
      tags: [' Cat ', 'cat', 'CAT', ...many],
      keywords: [],
    });

    expect(metadata.tags[0]).toBe('cat');
    expect(metadata.tags).toHaveLength(MAX_TAGS);
    expect(new Set(metadata.tags).size).toBe(metadata.tags.length);
  });

  it('drops non-string entries instead of failing the whole asset', () => {
    const metadata = parseMetadata({ description: 'x', tags: ['ok', 7, null, {}], keywords: [] });

    expect(metadata.tags).toEqual(['ok']);
  });

  it('treats an empty or missing extractedText as null', () => {
    expect(
      parseMetadata({ description: 'x', tags: ['a'], extractedText: '   ' }).extractedText,
    ).toBeNull();
    expect(parseMetadata({ description: 'x', tags: ['a'] }).extractedText).toBeNull();
  });

  it('rejects output that is not JSON', () => {
    expect(() => parseMetadata('I cannot help with that.')).toThrow(AppError);
  });

  it('rejects a JSON array, which would otherwise read as an empty object', () => {
    expect(() => parseMetadata('[1,2,3]')).toThrow(/not a JSON object/);
  });

  it('rejects a response with no usable metadata rather than indexing a blank asset', () => {
    expect(() => parseMetadata({ description: '', tags: [], keywords: [] })).toThrow(
      /no usable metadata/,
    );
  });
});
