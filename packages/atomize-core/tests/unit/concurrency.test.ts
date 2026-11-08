import { describe, expect, test } from "bun:test";
import { runAsDependenciesFinish, runWithConcurrency } from "@sppg2001/atomize-core/utils/concurrency";

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

describe("runAsDependenciesFinish", () => {
  test("starts an item once everything it waits for has finished", async () => {
    const events: string[] = [];
    // 2 waits for 0 and 1; 3 waits for 2.
    await runAsDependenciesFinish([[], [], [0, 1], [2]], 4, async (index) => {
      events.push(`start ${index}`);
      await sleep(index === 1 ? 20 : 2);
      events.push(`end ${index}`);
    });

    expect(events.indexOf("start 2")).toBeGreaterThan(events.indexOf("end 1"));
    expect(events.indexOf("start 3")).toBeGreaterThan(events.indexOf("end 2"));
  });

  test("doesn't wait on items an item doesn't depend on", async () => {
    const events: string[] = [];
    await runAsDependenciesFinish([[], [], [0]], 3, async (index) => {
      events.push(`start ${index}`);
      await sleep(index === 1 ? 30 : 2);
      events.push(`end ${index}`);
    });
    expect(events.indexOf("start 2")).toBeLessThan(events.indexOf("end 1"));
  });

  test("starts ready items in index order when slots are scarce", async () => {
    const started: number[] = [];
    await runAsDependenciesFinish([[], [], [0], []], 1, async (index) => {
      started.push(index);
    });
    expect(started).toEqual([0, 1, 2, 3]);
  });

  test("stops starting items after a worker fails, then rejects", async () => {
    const started: number[] = [];
    await expect(
      runAsDependenciesFinish([[], [0], [1]], 1, async (index) => {
        started.push(index);
        if (index === 1) throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(started).toEqual([0, 1]);
  });

  test("stops starting items once shouldStop returns true", async () => {
    const started: number[] = [];
    let stop = false;
    await runAsDependenciesFinish(
      [[], [0], [1]],
      1,
      async (index) => {
        started.push(index);
        stop = true;
      },
      { shouldStop: () => stop },
    );
    expect(started).toEqual([0]);
  });
});
