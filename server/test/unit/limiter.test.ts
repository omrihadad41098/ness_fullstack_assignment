import { describe, expect, it } from 'vitest';
import { createLimiter } from '../../src/lib/limiter.js';

/** A promise plus the function that settles it, so tests control exactly when a task finishes. */
function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe('createLimiter', () => {
  it('never runs more tasks at once than the limit', async () => {
    const limiter = createLimiter(2);
    const gates = [deferred(), deferred(), deferred()];
    let active = 0;
    let peak = 0;

    const runs = gates.map((gate) =>
      limiter.run(async () => {
        active += 1;
        peak = Math.max(peak, active);
        await gate.promise;
        active -= 1;
      }),
    );

    await Promise.resolve();
    expect(peak).toBe(2);

    for (const gate of gates) gate.resolve();
    await Promise.all(runs);
    expect(peak).toBe(2);
  });

  it('starts a queued task as soon as a slot frees up', async () => {
    const limiter = createLimiter(1);
    const order: string[] = [];

    const first = limiter.run(() => {
      order.push('first');
      return Promise.resolve();
    });
    const second = limiter.run(() => {
      order.push('second');
      return Promise.resolve();
    });

    await Promise.all([first, second]);
    expect(order).toEqual(['first', 'second']);
  });

  it('rejects the caller but keeps draining the queue after a task throws', async () => {
    const limiter = createLimiter(1);
    const failing = limiter.run(() => Promise.reject(new Error('boom')));
    const following = limiter.run(() => Promise.resolve('ok'));

    await expect(failing).rejects.toThrow('boom');
    await expect(following).resolves.toBe('ok');
  });

  it('resolves whenIdle only once everything has finished', async () => {
    const limiter = createLimiter(1);
    const gate = deferred();
    let idle = false;

    const task = limiter.run(() => gate.promise);
    void limiter.whenIdle().then(() => {
      idle = true;
    });

    await Promise.resolve();
    expect(idle).toBe(false);

    gate.resolve();
    await task;
    await limiter.whenIdle();
    expect(limiter.pending).toBe(0);
  });

  it('resolves whenIdle immediately when nothing is queued', async () => {
    await expect(createLimiter(1).whenIdle()).resolves.toBeUndefined();
  });
});
