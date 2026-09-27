export type Limiter = {
  run<T>(task: () => Promise<T>): Promise<T>;
  /** Resolves when nothing is running or queued — used by tests and graceful shutdown. */
  whenIdle(): Promise<void>;
  readonly pending: number;
};

/**
 * Caps how many tasks run at once. Written by hand rather than pulled in (p-limit) because it is
 * fifteen lines and the semantics matter: uploads of ten files must not fire ten AI calls at once.
 */
export function createLimiter(max: number): Limiter {
  const queue: (() => void)[] = [];
  const idleWaiters: (() => void)[] = [];
  let active = 0;

  const next = (): void => {
    if (active >= max) return;
    const start = queue.shift();
    if (start === undefined) {
      if (active === 0) {
        for (const resolve of idleWaiters.splice(0)) resolve();
      }
      return;
    }
    active += 1;
    start();
  };

  return {
    run<T>(task: () => Promise<T>): Promise<T> {
      return new Promise<T>((resolve, reject) => {
        queue.push(() => {
          task()
            .then(resolve, reject)
            .finally(() => {
              active -= 1;
              next();
            });
        });
        next();
      });
    },

    whenIdle(): Promise<void> {
      if (active === 0 && queue.length === 0) return Promise.resolve();
      return new Promise((resolve) => idleWaiters.push(resolve));
    },

    get pending(): number {
      return active + queue.length;
    },
  };
}
