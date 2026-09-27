import { afterEach, describe, expect, it, vi } from 'vitest';
import { createGeminiProvider, extractOutputText } from '../../src/ai/geminiProvider.js';

const validBody = JSON.stringify({
  description: 'A printed receipt.',
  tags: ['receipt'],
  keywords: ['document', 'paper'],
  extractedText: 'TOTAL 42',
});

function jsonResponse(status: number, body: string): Response {
  return new Response(body, { status, headers: { 'content-type': 'application/json' } });
}

function okResponse(outputText: string): Response {
  return jsonResponse(200, JSON.stringify({ interaction: { output_text: outputText } }));
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('extractOutputText', () => {
  it('reads the nested REST envelope', () => {
    expect(extractOutputText({ interaction: { output_text: 'hi' } })).toBe('hi');
  });

  it('reads a flat envelope', () => {
    expect(extractOutputText({ output_text: 'hi' })).toBe('hi');
  });

  it('joins text parts when the output is a content array', () => {
    expect(extractOutputText({ output: [{ text: 'a' }, { text: 'b' }, { image: {} }] })).toBe(
      'a\nb',
    );
  });

  it('returns null for a shape it cannot read', () => {
    expect(extractOutputText({ candidates: [] })).toBeNull();
    expect(extractOutputText(null)).toBeNull();
    expect(extractOutputText('text')).toBeNull();
  });
});

describe('geminiProvider', () => {
  it('posts the image as base64 alongside the prompt', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(okResponse(validBody));
    const provider = createGeminiProvider('key-123', 'gemini-test');

    await provider.analyzeImage({
      data: Buffer.from('PNGDATA'),
      mimeType: 'image/png',
      fileName: 'receipt.png',
    });

    const [, init] = fetchMock.mock.calls[0] ?? [];
    const rawBody = typeof init?.body === 'string' ? init.body : '';
    const body = JSON.parse(rawBody) as {
      model: string;
      input: { type: string; data?: string; mime_type?: string }[];
    };
    expect(body.model).toBe('gemini-test');
    expect(body.input[1]).toEqual({
      type: 'image',
      data: Buffer.from('PNGDATA').toString('base64'),
      mime_type: 'image/png',
    });
    expect(new Headers(init?.headers).get('x-goog-api-key')).toBe('key-123');
  });

  it('parses the model output into metadata', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(okResponse(validBody));

    const metadata = await createGeminiProvider('key', null).analyzeText({
      text: 'a receipt',
      fileName: 'a.txt',
    });

    expect(metadata.tags).toEqual(['receipt']);
    expect(metadata.keywords).toEqual(['document', 'paper']);
  });

  it('retries a 429 and succeeds on the next attempt', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse(429, 'rate limited'))
      .mockResolvedValueOnce(okResponse(validBody));

    await expect(
      createGeminiProvider('key', null).analyzeText({ text: 'x', fileName: 'a.txt' }),
    ).resolves.toMatchObject({ tags: ['receipt'] });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  }, 10_000);

  it('does not retry a 401, so a bad key fails immediately', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(401, 'bad key'));

    await expect(
      createGeminiProvider('key', null).analyzeText({ text: 'x', fileName: 'a.txt' }),
    ).rejects.toThrow(/401/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('fails the asset when the response carries no text', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(200, '{}'));

    await expect(
      createGeminiProvider('key', null).analyzeText({ text: 'x', fileName: 'a.txt' }),
    ).rejects.toThrow(/no text output/);
  });
});
