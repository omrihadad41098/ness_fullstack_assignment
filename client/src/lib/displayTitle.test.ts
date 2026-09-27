import { describe, expect, it } from 'vitest';
import { displayTitle } from './displayTitle';

describe('displayTitle', () => {
  it('shows the AI title and never the filename', () => {
    expect(
      displayTitle({ title: 'Black cat', status: 'ready' }),
    ).toBe('Black cat');
  });

  it('strips wrapping whitespace', () => {
    expect(displayTitle({ title: '  Receipt  ', status: 'ready' })).toBe('Receipt');
  });

  it('does not fall back to a filename while analysis is still running', () => {
    expect(displayTitle({ title: null, status: 'pending' })).toBe('Analysing…');
    expect(displayTitle({ title: '', status: 'processing' })).toBe('Analysing…');
  });

  it('uses a generic label when there is no title, never the original path', () => {
    expect(displayTitle({ title: null, status: 'failed' })).toBe('Untitled');
    expect(displayTitle({ title: null, status: 'ready' })).toBe('Untitled');
  });
});
