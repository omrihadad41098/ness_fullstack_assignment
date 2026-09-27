import { describe, expect, it, vi } from 'vitest';
import { RetryableAiError, withRetry } from '../../src/ai/retry.js';

const noSleep = (): Promise<void> => Promise.resolve();

describe('withRetry', () => {
  it('returns the first successful result without sleeping', async () => {
    const sleep = vi.fn(noSleep);
    const run = vi.fn(() => Promise.resolve('ok'));

    await expect(withRetry(run, { attempts: 3, baseDelayMs: 10, sleep })).resolves.toBe('ok');
    expect(run).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('retries a retryable failure and succeeds', async () => {
    let calls = 0;
    const run = vi.fn(() => {
      calls += 1;
      return calls < 3 ? Promise.reject(new RetryableAiError('429')) : Promise.resolve('ok');
    });

    await expect(withRetry(run, { attempts: 3, baseDelayMs: 10, sleep: noSleep })).resolves.toBe(
      'ok',
    );
    expect(run).toHaveBeenCalledTimes(3);
  });

  it('backs off exponentially', async () => {
    const delays: number[] = [];
    const sleep = (ms: number): Promise<void> => {
      delays.push(ms);
      return Promise.resolve();
    };

    await expect(
      withRetry(() => Promise.reject(new RetryableAiError('boom')), {
        attempts: 3,
        baseDelayMs: 100,
        sleep,
      }),
    ).rejects.toThrow('boom');
    expect(delays).toEqual([100, 200]);
  });

  it('never retries a non-retryable error, so a bad API key fails fast', async () => {
    const run = vi.fn(() => Promise.reject(new Error('401 unauthorized')));

    await expect(withRetry(run, { attempts: 5, baseDelayMs: 10, sleep: noSleep })).rejects.toThrow(
      '401 unauthorized',
    );
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('gives up after the configured number of attempts', async () => {
    const run = vi.fn(() => Promise.reject(new RetryableAiError('503')));

    await expect(withRetry(run, { attempts: 3, baseDelayMs: 1, sleep: noSleep })).rejects.toThrow(
      '503',
    );
    expect(run).toHaveBeenCalledTimes(3);
  });
});
