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
