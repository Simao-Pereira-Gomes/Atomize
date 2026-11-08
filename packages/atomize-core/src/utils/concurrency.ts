export interface RunWithConcurrencyOptions {
  /** Checked before each item starts; once true, no new item starts and running ones finish. */
  shouldStop?: () => boolean;
}

/**
 * Runs `worker` over `items` with at most `limit` in flight, starting the next item as soon as a
 * slot frees up (no fixed windows that wait for their slowest item). Items start in list order.
 * Rejects with the first worker error; workers that must not stop the run should catch their own.
 */
export async function runWithConcurrency<T>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<void>,
  options: RunWithConcurrencyOptions = {},
): Promise<void> {
  let next = 0;
  const runSlot = async (): Promise<void> => {
    while (next < items.length && !options.shouldStop?.()) {
      const index = next++;
      await worker(items[index] as T, index);
    }
  };
  const slots = Math.min(Math.max(1, Math.floor(limit) || 1), items.length);
  await Promise.all(Array.from({ length: slots }, runSlot));
}

/**
 * Runs `worker` once per item, where `dependencies[i]` lists the indices item `i` waits for. An item
 * starts as soon as every item it waits for has finished (successfully or not) and a slot is free; at
 * most `limit` run at once, and ready items start in index order. Rejects with the first worker error
 * after the running items finish. Items in a dependency cycle never start.
 */
export function runAsDependenciesFinish(
  dependencies: readonly (readonly number[])[],
  limit: number,
  worker: (index: number) => Promise<void>,
  options: RunWithConcurrencyOptions = {},
): Promise<void> {
  const slots = Math.max(1, Math.floor(limit) || 1);
  const waitingOn = dependencies.map((deps) => deps.length);
  const dependents = dependencies.map((): number[] => []);
  dependencies.forEach((deps, index) => {
    for (const dep of deps) dependents[dep]?.push(index);
  });
  const ready = waitingOn.flatMap((count, index) => (count === 0 ? [index] : []));
  let running = 0;
  let failed = false;
  let firstError: unknown;

  return new Promise((resolve, reject) => {
    const pump = () => {
      while (running < slots && ready.length > 0 && !failed && !options.shouldStop?.()) {
        start(ready.shift() as number);
      }
      if (running === 0) {
        if (failed) reject(firstError);
        else resolve();
      }
    };
    const start = (index: number) => {
      running++;
      worker(index)
        .catch((error: unknown) => {
          if (!failed) {
            failed = true;
            firstError = error;
          }
        })
        .finally(() => {
          running--;
          for (const dependent of dependents[index] ?? []) {
            waitingOn[dependent] = (waitingOn[dependent] ?? 1) - 1;
            if (waitingOn[dependent] === 0) {
              const at = ready.findIndex((queued) => queued > dependent);
              ready.splice(at === -1 ? ready.length : at, 0, dependent);
            }
          }
          pump();
        });
    };
    pump();
  });
}
