export class RetryableAiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RetryableAiError';
  }
}

export type RetryOptions = {
  attempts: number;
  baseDelayMs: number;
  /** Injected so unit tests can run the backoff without real timers. */
  sleep?: (ms: number) => Promise<void>;
};

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Retries only `RetryableAiError` (429 / 5xx / network). A 400 or a bad API key is retried never —
 * repeating it just burns quota and delays the `failed` status the user needs to see.
 */
export async function withRetry<T>(run: () => Promise<T>, options: RetryOptions): Promise<T> {
  const sleep = options.sleep ?? defaultSleep;
  let lastError: unknown;

  for (let attempt = 1; attempt <= options.attempts; attempt += 1) {
    try {
      return await run();
    } catch (err) {
      lastError = err;
      if (!(err instanceof RetryableAiError) || attempt === options.attempts) throw err;
      await sleep(options.baseDelayMs * 2 ** (attempt - 1));
    }
  }

  throw lastError;
}
