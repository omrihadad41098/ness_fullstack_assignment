/** What the AI must produce for every asset; this is what search runs against. */
export type AssetMetadata = {
  /** A few words naming the subject ("Black cat") — the only one of these fields the UI shows. */
  title: string;
  /** 1–3 sentences describing the asset. Indexed for search, not displayed. */
  description: string;
  /** Concrete terms: objects, attributes, colours, people features. Multi-word terms stay intact. */
  tags: string[];
  /** Synonyms and broad categories ("document", "person", "animal") that make fuzzy queries hit. */
  keywords: string[];
  /** Text visible in an image, or the source text of a text file; null when there is none. */
  extractedText: string | null;
};

export type ImageInput = {
  data: Buffer;
  mimeType: string;
  fileName: string;
};

export type TextInput = {
  text: string;
  fileName: string;
};

/**
 * The seam between the app and whichever vendor is analysing files. Declared as plain function
 * properties rather than methods: implementations are closures over their config, never `this`.
 */
export type AiProvider = {
  /** Stored on each asset so metadata can be traced back to what produced it. */
  readonly name: string;
  readonly model: string;
  readonly analyzeImage: (input: ImageInput) => Promise<AssetMetadata>;
  readonly analyzeText: (input: TextInput) => Promise<AssetMetadata>;
};
