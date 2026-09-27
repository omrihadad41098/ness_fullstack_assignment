/** Bump when the prompt changes; stored on each asset so stale metadata is identifiable. */
export const PROMPT_VERSION = 'v2';

/** Text files are summarised from their opening; the full text is stored separately for search. */
export const MAX_PROMPT_TEXT_CHARS = 8_000;

/**
 * The instruction that makes the brief's examples work without embeddings: the model must emit
 * concrete attributes ("black hair") *and* broad category words ("document"), so a MongoDB text
 * query for either one matches a photograph as readily as a text file.
 */
const SHARED_RULES = `You index files for a searchable library. Return metadata that makes the file findable by everyday search terms.

Rules:
- title: 2-5 words naming the subject, like a photo caption: "Black cat", "Handwritten receipt", "Quarterly sales notes". Sentence case. Never mention the file name, the file type, byte sizes or that you are an AI.
- description: 1-3 plain sentences describing what this is.
- tags: 5-15 short lowercase terms for what is concretely present: objects, colours, materials, setting, and people's visible attributes such as hair colour, hair length, clothing and age group. Keep multi-word terms together as one tag, for example "black hair", not "black" and "hair".
- keywords: 5-15 lowercase synonyms and BROAD CATEGORY words a person might search for instead of the exact tag. Always include the general category. A photo of a receipt or a scanned page must include "document" and "paper"; a photo of a person must include "person" and "portrait"; a cat must include "animal" and "pet".
- extractedText: any text visible in the file, verbatim. Use null when there is none.
- Never invent details you cannot see. Prefer fewer, accurate terms.

Respond with JSON only, matching: {"title": string, "description": string, "tags": string[], "keywords": string[], "extractedText": string | null}`;

export function imagePrompt(fileName: string): string {
  return `${SHARED_RULES}

Analyse this image. Its filename is "${fileName}" (a weak hint; trust the pixels over the name).`;
}

export function textPrompt(fileName: string, text: string): string {
  return `${SHARED_RULES}

Analyse this text file named "${fileName}". For a text file, extractedText must be null - the raw text is stored separately.

--- FILE CONTENT ---
${text}
--- END FILE CONTENT ---`;
}
