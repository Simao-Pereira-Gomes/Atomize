import { describe, expect, test } from "bun:test";
import { RunTimings } from "../packages/atomize-core/src/utils/run-timings";
import { summariseTimings } from "./summarise-timings";

describe("summariseTimings", () => {
  test("puts each run in a row of one Markdown table", async () => {
    let now = 0;
    const timings = new RunTimings({ now: () => now });
    timings.setRun({ storyConcurrency: 3, taskConcurrency: 5, dependencyConcurrency: 5, stories: 1 });
    await timings.phase("processStories", async () => {
      now = 1_000;
    });
    timings.recordRequest({ method: "createWorkItem", queuedAt: 0, attempts: [{ sentAt: 0, finishedAt: 1_000, inFlight: 1, limit: Number.POSITIVE_INFINITY }], ok: true });

    const lines = summariseTimings([{ label: "flat-3-5-5", record: timings.toJSON() }]).split("\n");

    expect(lines).toHaveLength(3);
    expect(lines[2]).toStartWith("| flat-3-5-5 | 3/5/5 | 1 | 1.0 |");
    expect(lines[2]).toContain("| 1000/1000 |");
    expect(lines[2]).toContain("| 1 / 15 |");
  });

  test("refuses a record in a format it doesn't know", () => {
    const record = { ...new RunTimings().toJSON(), version: 2 } as unknown as ReturnType<RunTimings["toJSON"]>;

    expect(() => summariseTimings([{ label: "future", record }])).toThrow("unsupported timings version 2");
  });
});
