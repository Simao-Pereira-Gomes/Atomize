import { describe, expect, test } from "bun:test";
import { RunTimings } from "@sppg2001/atomize-core/utils/run-timings";

function clockAt(start = 1_000) {
  let now = start;
  return {
    now: () => now,
    advance: (ms: number) => {
      now += ms;
    },
    set: (ms: number) => {
      now = ms;
    },
  };
}

describe("RunTimings", () => {
  test("records phases relative to when timing started", async () => {
    const clock = clockAt(1_000);
    const timings = new RunTimings({ now: clock.now });
    clock.advance(10);

    const value = await timings.phase("connect", async () => {
      clock.advance(250);
      return 42;
    });

    expect(value).toBe(42);
    const record = timings.toJSON();
    expect(record.version).toBe(1);
    expect(record.phases).toEqual([{ name: "connect", startMs: 10, endMs: 260 }]);
    expect(record.summary.phases).toEqual({ connect: 250 });
  });

  test("records a phase that throws, and rethrows", async () => {
    const clock = clockAt();
    const timings = new RunTimings({ now: clock.now });

    await expect(
      timings.phase("storyQuery", async () => {
        clock.advance(5);
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    expect(timings.toJSON().phases).toEqual([{ name: "storyQuery", startMs: 0, endMs: 5 }]);
  });

  test("a phase still running when the record is written ends at that moment, marked unfinished", async () => {
    const clock = clockAt(0);
    const timings = new RunTimings({ now: clock.now });
    let finish: () => void = () => undefined;
    const running = timings.phase("processStories", () => new Promise<void>((resolve) => {
      finish = resolve;
    }));
    clock.set(300);

    const record = timings.toJSON();
    expect(record.phases).toEqual([{ name: "processStories", startMs: 0, endMs: 300, unfinished: true }]);
    expect(record.summary.phases).toEqual({ processStories: 300 });

    finish();
    await running;
    expect(timings.toJSON().phases).toEqual([{ name: "processStories", startMs: 0, endMs: 300 }]);
  });

  test("keeps the run settings and the total time", () => {
    const clock = clockAt();
    const timings = new RunTimings({ now: clock.now });
    timings.setRun({ template: "flat", dryRun: false, storyConcurrency: 3, taskConcurrency: 5, dependencyConcurrency: 5 });
    timings.setRun({ stories: 20 });
    clock.advance(1_234);

    expect(timings.toJSON().run).toEqual({
      template: "flat",
      dryRun: false,
      storyConcurrency: 3,
      taskConcurrency: 5,
      dependencyConcurrency: 5,
      stories: 20,
      totalMs: 1_234,
    });
  });

  test("summarises requests per method: queued time includes waits between retries", () => {
    const clock = clockAt(0);
    const timings = new RunTimings({ now: clock.now });
    timings.recordRequest({
      method: "createWorkItem",
      queuedAt: 0,
      attempts: [
        { sentAt: 10, finishedAt: 110, inFlight: 1, limit: Number.POSITIVE_INFINITY, status: 429, retryAfterMs: 1_000 },
        { sentAt: 1_110, finishedAt: 1_210, inFlight: 1, limit: 2 },
      ],
      ok: true,
    });
    timings.recordRequest({
      method: "createWorkItem",
      queuedAt: 0,
      attempts: [{ sentAt: 0, finishedAt: 300, inFlight: 2, limit: Number.POSITIVE_INFINITY }],
      ok: true,
    });
    timings.recordRequest({
      method: "getWorkItems",
      queuedAt: 0,
      attempts: [{ sentAt: 0, finishedAt: 50, inFlight: 1, limit: Number.POSITIVE_INFINITY }],
      ok: false,
    });

    const record = timings.toJSON();
    expect(record.requests[0]?.attempts[0]).toEqual({
      sentMs: 10, endMs: 110, inFlight: 1, limit: null, status: 429, retryAfterMs: 1_000,
    });
    expect(record.summary.requests.total).toBe(3);
    expect(record.summary.requests.failed).toBe(1);
    expect(record.summary.requests.byMethod.createWorkItem).toEqual({
      count: 2,
      retries: 1,
      queued: { total: 1_010, p50: 0, p95: 1_010, max: 1_010 },
      inFlight: { total: 500, p50: 200, p95: 300, max: 300 },
    });
    expect(record.summary.throttleEvents).toBe(1);
  });

  test("counts a successful response carrying Retry-After as a throttle event", () => {
    const timings = new RunTimings({ now: () => 0 });
    timings.recordRequest({
      method: "getWorkItems",
      queuedAt: 0,
      attempts: [{ sentAt: 0, finishedAt: 10, inFlight: 1, limit: Number.POSITIVE_INFINITY, retryAfterMs: 2_000 }],
      ok: true,
    });

    expect(timings.toJSON().summary.throttleEvents).toBe(1);
  });

  test("reports the peak in flight, and the average in flight while Stories were processed against the nominal limit", async () => {
    const clock = clockAt(0);
    const timings = new RunTimings({ now: clock.now });
    timings.setRun({ storyConcurrency: 3, taskConcurrency: 5 });
    // Before processing: a request that must not count toward the processing average.
    timings.recordRequest({ method: "queryByWiql", queuedAt: 0, attempts: [{ sentAt: 0, finishedAt: 100, inFlight: 1, limit: Number.POSITIVE_INFINITY }], ok: true });
    clock.set(100);
    await timings.phase("processStories", async () => {
      clock.set(200);
    });
    // 100–200: two requests overlap for 50 ms, one alone for 50 ms → 150 request-ms over 100 ms.
    timings.recordRequest({ method: "createWorkItem", queuedAt: 100, attempts: [{ sentAt: 100, finishedAt: 200, inFlight: 1, limit: Number.POSITIVE_INFINITY }], ok: true });
    timings.recordRequest({ method: "createWorkItem", queuedAt: 100, attempts: [{ sentAt: 150, finishedAt: 200, inFlight: 2, limit: Number.POSITIVE_INFINITY }], ok: true });

    const { summary } = timings.toJSON();
    expect(summary.peakInFlight).toBe(2);
    expect(summary.avgInFlightWhileProcessing).toBe(1.5);
    expect(summary.nominalInFlight).toBe(15);
  });

  test("records each Story's slot wait, calculation and creation", () => {
    const clock = clockAt(0);
    const timings = new RunTimings({ now: clock.now });
    const readyAt = clock.now();

    clock.set(0);
    const first = timings.startStory("1", readyAt);
    clock.set(40);
    first.planned();
    clock.set(400);
    first.end("success");

    clock.set(400);
    const second = timings.startStory("2", readyAt);
    clock.set(420);
    second.end("skipped");

    const record = timings.toJSON();
    expect(record.stories).toEqual([
      { id: "1", readyMs: 0, startMs: 0, plannedMs: 40, endMs: 400, outcome: "success" },
      { id: "2", readyMs: 0, startMs: 400, endMs: 420, outcome: "skipped" },
    ]);
    expect(record.summary.stories).toEqual({
      count: 2,
      slotWait: { total: 400, p50: 0, p95: 400, max: 400 },
      calculate: { total: 60, p50: 20, p95: 40, max: 40 },
      create: { total: 360, p50: 360, p95: 360, max: 360 },
    });
  });

  test("a Story still running when the record is written has no end", () => {
    const timings = new RunTimings({ now: () => 0 });
    timings.startStory("1", 0);

    expect(timings.toJSON().stories).toEqual([{ id: "1", readyMs: 0, startMs: 0 }]);
  });
});
