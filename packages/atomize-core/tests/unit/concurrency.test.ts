import { describe, expect, test } from "bun:test";
import { runWithConcurrency } from "@sppg2001/atomize-core/utils/concurrency";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("runWithConcurrency", () => {
  test("starts the next item as soon as a slot frees up, not when the whole window finishes", async () => {
    const started: string[] = [];
    // A is slow; B and C are quick. With fixed windows of 2, C would wait for A.
    const durations: Record<string, number> = { A: 60, B: 5, C: 5 };

    await runWithConcurrency(["A", "B", "C"], 2, async (item) => {
      started.push(item);
      await sleep(durations[item] ?? 0);
    });

    expect(started).toEqual(["A", "B", "C"]);
  });

  test("C finishes before the slow A does", async () => {
    const finished: string[] = [];
    const durations: Record<string, number> = { A: 60, B: 5, C: 5 };

    await runWithConcurrency(["A", "B", "C"], 2, async (item) => {
      await sleep(durations[item] ?? 0);
      finished.push(item);
    });

    expect(finished).toEqual(["B", "C", "A"]);
  });

  test("never runs more than the limit at once", async () => {
    let inFlight = 0;
    let peak = 0;

    await runWithConcurrency([1, 2, 3, 4, 5, 6, 7], 3, async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await sleep(5);
      inFlight--;
    });

    expect(peak).toBe(3);
  });

  test("passes each item's index to the worker", async () => {
    const seen: Array<[string, number]> = [];
    await runWithConcurrency(["a", "b", "c"], 2, async (item, index) => {
      seen.push([item, index]);
    });
    expect(seen.sort((x, y) => x[1] - y[1])).toEqual([["a", 0], ["b", 1], ["c", 2]]);
  });

  test("stops starting new items once shouldStop returns true, letting running ones finish", async () => {
    const started: number[] = [];
    const finished: number[] = [];
    let stop = false;

    await runWithConcurrency(
      [0, 1, 2, 3, 4],
      2,
      async (item) => {
        started.push(item);
        await sleep(item === 0 ? 5 : 20);
        if (item === 0) stop = true;
        finished.push(item);
      },
      { shouldStop: () => stop },
    );

    expect(started).toEqual([0, 1]);
    expect(finished.sort()).toEqual([0, 1]);
  });

  test("treats a limit below 1 as 1", async () => {
    let peak = 0;
    let inFlight = 0;
    await runWithConcurrency([1, 2, 3], 0, async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await sleep(1);
      inFlight--;
    });
    expect(peak).toBe(1);
  });

  test("does nothing for an empty list", async () => {
    let calls = 0;
    await runWithConcurrency([], 3, async () => {
      calls++;
    });
    expect(calls).toBe(0);
  });

  test("rejects when a worker throws", async () => {
    await expect(
      runWithConcurrency([1, 2], 2, async (item) => {
        if (item === 2) throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
  });
});
