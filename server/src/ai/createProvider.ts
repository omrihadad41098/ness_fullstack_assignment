import { createFakeAiProvider } from './fakeAiProvider.js';
import { createGeminiProvider } from './geminiProvider.js';
import type { AiProvider } from './aiProvider.js';
import type { Config } from '../config.js';

/**
 * The single place that knows which vendor is in use. Adding one (OpenAI, Claude, a self-hosted
 * model) means one new file implementing `AiProvider` plus one branch here — nothing else changes.
 */
export function createAiProvider(config: Config): AiProvider {
  if (config.aiProvider === 'fake') return createFakeAiProvider();
  if (config.aiApiKey === null) {
    throw new Error(`AI provider "${config.aiProvider}" requires an API key`);
  }
  return createGeminiProvider(config.aiApiKey, config.aiModel);
}
