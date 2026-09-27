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
    title: { type: 'string', description: '2-5 words naming the subject, like a photo caption.' },
    description: { type: 'string', description: '1-3 sentences describing the file.' },
    tags: { type: 'array', items: { type: 'string' } },
    keywords: { type: 'array', items: { type: 'string' } },
    extractedText: { type: 'string', description: 'Text visible in the file, or an empty string.' },
  },
  required: ['title', 'description', 'tags', 'keywords'],
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

type Json = Record<string, unknown>;

function isObject(value: unknown): value is Json {
  return typeof value === 'object' && value !== null;
}

/**
 * The Interactions REST response is `{ steps: [...] }`: `thought` steps carry the model's reasoning
 * (an opaque signature, no text) and `model_output` steps carry `content: [{ type: 'text', text }]`.
 * Only model output is the answer — thoughts must never reach `parseMetadata`.
 */
export function extractOutputText(payload: unknown): string | null {
  if (!isObject(payload) || !Array.isArray(payload.steps)) return null;

  const texts = payload.steps
    .filter((step): step is Json => isObject(step) && step.type === 'model_output')
    .flatMap((step): unknown[] => (Array.isArray(step.content) ? step.content : []))
    .filter((part): part is Json => isObject(part) && part.type === 'text')
    .map((part) => part.text)
    .filter((text): text is string => typeof text === 'string' && text.trim() !== '');

  return texts.length > 0 ? texts.join('') : null;
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
