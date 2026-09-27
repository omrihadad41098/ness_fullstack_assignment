import { log } from '../logger.js';
import { parseMetadata } from './parseMetadata.js';
import { imagePrompt, textPrompt } from './prompts.js';
import { RetryableAiError, withRetry } from './retry.js';
import { AppError } from '../http/errors.js';
import type { AiProvider, AssetMetadata, ImageInput, TextInput } from './aiProvider.js';

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/interactions';
export const DEFAULT_GEMINI_MODEL = 'gemini-3.8-flash';
const TIMEOUT_MS = 30_000;
const ATTEMPTS = 3;

/** Constrains the model to the exact shape `parseMetadata` expects. */
const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    description: { type: 'string', description: '1-3 sentences describing the file.' },
    tags: { type: 'array', items: { type: 'string' } },
    keywords: { type: 'array', items: { type: 'string' } },
    extractedText: { type: 'string', description: 'Text visible in the file, or an empty string.' },
  },
  required: ['description', 'tags', 'keywords'],
};

type InputPart =
  { type: 'text'; text: string } | { type: 'image'; data: string; mime_type: string };

export function createGeminiProvider(apiKey: string, model: string | null): AiProvider {
  const modelId = model ?? DEFAULT_GEMINI_MODEL;

  const analyse = async (parts: InputPart[], context: string): Promise<AssetMetadata> => {
    const startedAt = Date.now();
    const raw = await withRetry(() => callGemini(apiKey, modelId, parts), {
      attempts: ATTEMPTS,
      baseDelayMs: 500,
    });
    log.info(
      { provider: 'gemini', model: modelId, context, durationMs: Date.now() - startedAt },
      'ai call finished',
    );
    return parseMetadata(raw);
  };

  return {
    name: 'gemini',
    model: modelId,

    analyzeImage(input: ImageInput) {
      return analyse(
        [
          { type: 'text', text: imagePrompt(input.fileName) },
          {
            type: 'image',
            data: input.data.toString('base64'),
            mime_type: input.mimeType,
          },
        ],
        'image',
      );
    },

    analyzeText(input: TextInput) {
      return analyse([{ type: 'text', text: textPrompt(input.fileName, input.text) }], 'text');
    },
  };
}

async function callGemini(apiKey: string, model: string, input: InputPart[]): Promise<string> {
  let response: Response;
  try {
    response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        model,
        input,
        response_format: {
          type: 'text',
          mime_type: 'application/json',
          schema: RESPONSE_SCHEMA,
        },
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    // DNS failures, resets and timeouts are worth another attempt.
    throw new RetryableAiError(`Gemini request failed: ${describe(err)}`);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    const message = `Gemini responded ${response.status}: ${body.slice(0, 300)}`;
    // 429 = rate limited, 5xx = their side. 400/401/403 mean our request or key is wrong:
    // retrying those only burns quota and delays the `failed` status the user needs to see.
    if (response.status === 429 || response.status >= 500) throw new RetryableAiError(message);
    throw new AppError('AI_UNAVAILABLE', message);
  }

  const payload: unknown = await response.json().catch(() => null);
  const text = extractOutputText(payload);
  if (text === null) throw new AppError('AI_UNAVAILABLE', 'Gemini returned no text output');
  return text;
}

/**
 * Pulls the model's text out of the response without assuming one exact envelope — SDKs expose it as
 * `output_text`, and the REST payload nests it under `interaction`.
 */
export function extractOutputText(payload: unknown): string | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const root = payload as Record<string, unknown>;
  const interaction =
    typeof root.interaction === 'object' && root.interaction !== null
      ? (root.interaction as Record<string, unknown>)
      : root;

  const direct = interaction.output_text ?? interaction.outputText;
  if (typeof direct === 'string' && direct.trim() !== '') return direct;

  const output = interaction.output ?? interaction.content;
  if (Array.isArray(output)) {
    const texts = output
      .map((item) =>
        typeof item === 'object' && item !== null
          ? (item as Record<string, unknown>).text
          : undefined,
      )
      .filter((value): value is string => typeof value === 'string');
    if (texts.length > 0) return texts.join('\n');
  }

  return null;
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
