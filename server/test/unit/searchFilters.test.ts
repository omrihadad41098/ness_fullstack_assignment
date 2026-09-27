import { describe, expect, it } from 'vitest';
import {
  buildRegexFilter,
  buildTextFilter,
  escapeRegex,
} from '../../src/repositories/searchFilters.js';

describe('escapeRegex', () => {
  it('escapes every metacharacter so user input is matched literally', () => {
    expect(escapeRegex('a.*b')).toBe('a\\.\\*b');
    expect(escapeRegex('(a|b)[c]{2}^$+?\\')).toBe('\\(a\\|b\\)\\[c\\]\\{2\\}\\^\\$\\+\\?\\\\');
  });

  it('leaves ordinary words untouched', () => {
    expect(escapeRegex('black hair')).toBe('black hair');
  });

  it('produces a pattern that matches the literal text, not a wildcard', () => {
    const pattern = new RegExp(escapeRegex('a.c'));

    expect(pattern.test('a.c')).toBe(true);
    expect(pattern.test('abc')).toBe(false);
  });
});

describe('buildTextFilter', () => {
  it('passes the query to $text as a plain string', () => {
    expect(buildTextFilter('black hair', null)).toEqual({
      status: 'ready',
      $text: { $search: 'black hair' },
    });
  });

  it('only searches ready assets, which are the ones with metadata', () => {
    expect(buildTextFilter('x', null).status).toBe('ready');
  });

  it('adds the kind filter when one is given', () => {
    expect(buildTextFilter('x', 'image')).toMatchObject({ kind: 'image' });
  });
});

describe('buildRegexFilter', () => {
  it('requires every term to match somewhere, so extra words narrow the results', () => {
    const filter = buildRegexFilter('black hair', null);
    const clauses = filter.$and as { $or: Record<string, RegExp>[] }[];

    expect(clauses).toHaveLength(2);
    expect(Object.values(clauses[0]?.$or[0] ?? {})[0]?.source).toBe('black');
    expect(Object.values(clauses[1]?.$or[0] ?? {})[0]?.source).toBe('hair');
  });

  it('searches tags, keywords, description and filename', () => {
    const filter = buildRegexFilter('doc', null);
    const clauses = filter.$and as { $or: Record<string, RegExp>[] }[];
    const fields = (clauses[0]?.$or ?? []).flatMap((clause) => Object.keys(clause));

    expect(fields).toEqual(['tags', 'keywords', 'description', 'originalName']);
  });

  it('matches case-insensitively', () => {
    const filter = buildRegexFilter('doc', null);
    const clauses = filter.$and as { $or: Record<string, RegExp>[] }[];

    expect(Object.values(clauses[0]?.$or[0] ?? {})[0]?.flags).toContain('i');
  });

  it('escapes metacharacters instead of executing them', () => {
    const filter = buildRegexFilter('.*', null);
    const clauses = filter.$and as { $or: Record<string, RegExp>[] }[];
    const pattern = Object.values(clauses[0]?.$or[0] ?? {})[0];

    expect(pattern?.source).toBe('\\.\\*');
    expect(pattern?.test('anything')).toBe(false);
  });

  it('matches nothing for a whitespace-only query rather than matching everything', () => {
    expect(buildRegexFilter('   ', null)).toEqual({ status: 'ready', _id: null });
  });
});
