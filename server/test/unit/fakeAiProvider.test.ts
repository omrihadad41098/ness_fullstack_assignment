import { describe, expect, it } from 'vitest';
import { createFakeAiProvider } from '../../src/ai/fakeAiProvider.js';

const provider = createFakeAiProvider();

describe('fakeAiProvider', () => {
  it('identifies itself so stored metadata records its provenance', () => {
    expect(provider.name).toBe('fake');
    expect(provider.model).toBe('deterministic-v1');
  });

  it('is deterministic: the same input always yields the same metadata', async () => {
    const input = { text: 'beta beta alpha gamma gamma delta', fileName: 'notes.txt' };

    expect(await provider.analyzeText(input)).toEqual(await provider.analyzeText(input));
  });

  it('derives image tags from the filename', async () => {
    const metadata = await provider.analyzeImage({
      data: Buffer.from('fake-bytes'),
      mimeType: 'image/png',
      fileName: 'portrait-black-hair.png',
    });

    expect(metadata.title).toBe('Portrait black hair');
    expect(metadata.tags).toContain('black');
    expect(metadata.tags).toContain('hair');
    expect(metadata.tags).toContain('image');
  });

  it('adds broad category keywords so a receipt is findable by "document"', async () => {
    const metadata = await provider.analyzeText({
      text: 'The receipt total was 42 dollars.',
      fileName: 'purchase.txt',
    });

    expect(metadata.keywords).toContain('document');
    expect(metadata.keywords).toContain('paper');
  });

  it('ranks frequent content words above rare ones', async () => {
    const metadata = await provider.analyzeText({
      text: 'server server server database logging',
      fileName: 'notes.txt',
    });

    expect(metadata.tags).toContain('server');
    expect(metadata.tags.indexOf('server')).toBeLessThan(metadata.tags.indexOf('logging'));
  });

  it('leaves extractedText to the caller, which stores the file text verbatim', async () => {
    const metadata = await provider.analyzeText({ text: 'hello world', fileName: 'a.txt' });

    expect(metadata.extractedText).toBeNull();
  });
});
