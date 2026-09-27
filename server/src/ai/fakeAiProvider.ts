import { parseMetadata } from './parseMetadata.js';
import type { AiProvider, AssetMetadata, ImageInput, TextInput } from './aiProvider.js';

const STOP_WORDS = new Set([
  'the',
  'a',
  'an',
  'and',
  'or',
  'of',
  'to',
  'in',
  'is',
  'it',
  'for',
  'on',
  'with',
  'that',
  'this',
  'be',
  'are',
  'as',
  'at',
  'by',
  'from',
  'was',
  'were',
  'has',
  'have',
]);

/**
 * Category hints so the offline provider can still demonstrate the brief's behaviour: a file whose
 * name or content mentions a receipt is findable by "document", exactly as the real model would.
 */
const CATEGORY_HINTS: { match: RegExp; keywords: string[] }[] = [
  { match: /receipt|invoice|scan|page|letter|report|doc/, keywords: ['document', 'paper', 'text'] },
  { match: /hair|face|portrait|person|people|woman|man|child/, keywords: ['person', 'portrait'] },
  { match: /cat|dog|bird|horse|animal|pet/, keywords: ['animal', 'pet'] },
  { match: /car|bike|bus|train|truck/, keywords: ['vehicle', 'transport'] },
  { match: /food|meal|pizza|coffee|fruit/, keywords: ['food', 'meal'] },
];

/**
 * Deterministic, offline, no network: lets the whole app run and be unit-tested without an API key.
 * It derives terms from the filename and (for text) the content, so results are explainable rather
 * than random — but it understands nothing, which is exactly why the real provider exists.
 */
export function createFakeAiProvider(): AiProvider {
  return {
    name: 'fake',
    model: 'deterministic-v1',

    analyzeImage(input: ImageInput): Promise<AssetMetadata> {
      const words = wordsFrom(input.fileName);
      const title = sentenceCase(words.join(' '));
      return Promise.resolve(
        parseMetadata({
          title,
          // Descriptions are indexed, so they say something about the file rather than about the
          // provider that produced them. Which provider ran is recorded on the asset itself.
          description: title,
          tags: unique([...words, 'image', extensionWord(input.mimeType)]),
          keywords: unique(['image', 'picture', 'photo', ...categoriesFor(words.join(' '))]),
          extractedText: null,
        }),
      );
    },

    analyzeText(input: TextInput): Promise<AssetMetadata> {
      const nameWords = wordsFrom(input.fileName);
      const contentWords = frequentWords(input.text, 10);
      return Promise.resolve(
        parseMetadata({
          title: sentenceCase(nameWords.join(' ')),
          description: openingOf(input.text),
          tags: unique([...nameWords, ...contentWords]),
          keywords: unique([
            'text',
            'document',
            ...categoriesFor(`${input.fileName} ${input.text}`.toLowerCase()),
          ]),
          extractedText: null,
        }),
      );
    },
  };
}

function wordsFrom(fileName: string): string[] {
  return fileName
    .replace(/\.[^.]+$/, '')
    .split(/[^a-z0-9]+/i)
    .map((word) => word.toLowerCase())
    .filter((word) => word.length > 2 && !STOP_WORDS.has(word));
}

function frequentWords(text: string, limit: number): string[] {
  const counts = new Map<string, number>();
  for (const word of text.toLowerCase().split(/[^a-z0-9]+/)) {
    if (word.length <= 3 || STOP_WORDS.has(word)) continue;
    counts.set(word, (counts.get(word) ?? 0) + 1);
  }
  return (
    [...counts.entries()]
      // Sort by count, then alphabetically, so the same input always yields the same order.
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, limit)
      .map(([word]) => word)
  );
}

function categoriesFor(haystack: string): string[] {
  return CATEGORY_HINTS.filter((hint) => hint.match.test(haystack)).flatMap(
    (hint) => hint.keywords,
  );
}

function sentenceCase(words: string): string {
  if (words === '') return 'Untitled';
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** The opening of a text file is the closest an offline provider can get to a real summary. */
function openingOf(text: string): string {
  const opening = text.trim().replace(/\s+/g, ' ').slice(0, 200);
  return opening === '' ? '' : opening;
}

function extensionWord(mimeType: string): string {
  return mimeType.split('/')[1] ?? 'file';
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter((value) => value !== ''))];
}
