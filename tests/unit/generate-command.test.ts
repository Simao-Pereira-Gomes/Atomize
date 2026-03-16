import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import type { AtomizationReport } from "@core/atomizer";
import { parseConcurrency, printReport } from "@/cli/commands/generate.command";
import { ExitCode } from "@/cli/utilities/exit-codes";

// ─── helpers ──────────────────────────────────────────────────────────────────

const noop = () => {};

function makeReport(overrides: Partial<AtomizationReport> = {}): AtomizationReport {
  return {
    templateName: "test-template",
    storiesProcessed: 1,
    storiesSuccess: 1,
    storiesFailed: 0,
    tasksCalculated: 3,
    tasksCreated: 3,
    tasksSkipped: 0,
    executionTime: 42,
    dryRun: false,
    results: [],
    errors: [],
    warnings: [],
    ...overrides,
  };
}

// ─── parseConcurrency ─────────────────────────────────────────────────────────

describe("parseConcurrency", () => {
  test("passes through valid values unchanged", () => {
    const result = parseConcurrency(
      { taskConcurrency: "8", storyConcurrency: "4", dependencyConcurrency: "3" },
      noop,
    );
    expect(result).toEqual({ taskConcurrency: 8, storyConcurrency: 4, dependencyConcurrency: 3 });
  });

  test("clamps task concurrency above max (20) to default (5)", () => {
    const warnings: string[] = [];
    const result = parseConcurrency(
      { taskConcurrency: "25", storyConcurrency: "3", dependencyConcurrency: "5" },
      (msg) => warnings.push(msg),
    );
    expect(result.taskConcurrency).toBe(5);
    expect(warnings.some((w) => w.includes("Task concurrency"))).toBe(true);
  });

  test("clamps story concurrency above max (10) to default (3)", () => {
    const warnings: string[] = [];
    const result = parseConcurrency(
      { taskConcurrency: "5", storyConcurrency: "15", dependencyConcurrency: "5" },
      (msg) => warnings.push(msg),
    );
    expect(result.storyConcurrency).toBe(3);
    expect(warnings.some((w) => w.includes("Story concurrency"))).toBe(true);
  });

  test("clamps dependency concurrency above max (10) to default (5)", () => {
    const warnings: string[] = [];
    const result = parseConcurrency(
      { taskConcurrency: "5", storyConcurrency: "3", dependencyConcurrency: "99" },
      (msg) => warnings.push(msg),
    );
    expect(result.dependencyConcurrency).toBe(5);
    expect(warnings.some((w) => w.includes("Dependency concurrency"))).toBe(true);
  });

  test("clamps zero values to defaults", () => {
    const result = parseConcurrency(
      { taskConcurrency: "0", storyConcurrency: "0", dependencyConcurrency: "0" },
      noop,
    );
    expect(result).toEqual({ taskConcurrency: 5, storyConcurrency: 3, dependencyConcurrency: 5 });
  });

  test("accepts boundary values (min=1, max=20 for tasks)", () => {
    const result = parseConcurrency(
      { taskConcurrency: "1", storyConcurrency: "1", dependencyConcurrency: "1" },
      noop,
    );
    expect(result).toEqual({ taskConcurrency: 1, storyConcurrency: 1, dependencyConcurrency: 1 });
  });

  test("does not print a warning when values are within range", () => {
    const warnings: string[] = [];
    parseConcurrency(
      { taskConcurrency: "5", storyConcurrency: "3", dependencyConcurrency: "5" },
      (msg) => warnings.push(msg),
    );
    expect(warnings).toHaveLength(0);
  });

  test("handles non-numeric strings by falling back to defaults", () => {
    const result = parseConcurrency(
      { taskConcurrency: "abc", storyConcurrency: "xyz", dependencyConcurrency: "!" },
      noop,
    );
    // parseInt("abc") → NaN → || 5 default; all within range so no clamping
    expect(result).toEqual({ taskConcurrency: 5, storyConcurrency: 3, dependencyConcurrency: 5 });
  });
});

// ─── printReport ──────────────────────────────────────────────────────────────

describe("printReport", () => {
  let consoleSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    consoleSpy = spyOn(console, "log").mockImplementation(noop);
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  test("returns NoMatch when no stories were processed", () => {
    const code = printReport(makeReport({ storiesProcessed: 0 }), { verbose: false }, false);
    expect(code).toBe(ExitCode.NoMatch);
  });

  test("returns Success when all stories succeed (dry run)", () => {
    const code = printReport(
      makeReport({ storiesProcessed: 2, storiesSuccess: 2, storiesFailed: 0 }),
      { verbose: false },
      true,
    );
    expect(code).toBe(ExitCode.Success);
  });

  test("returns Success when all stories succeed (live run)", () => {
    const code = printReport(
      makeReport({ storiesProcessed: 1, storiesSuccess: 1, storiesFailed: 0 }),
      { verbose: false },
      false,
    );
    expect(code).toBe(ExitCode.Success);
  });

  test("returns Failure when any story fails", () => {
    const code = printReport(
      makeReport({ storiesProcessed: 3, storiesSuccess: 2, storiesFailed: 1 }),
      { verbose: false },
      false,
    );
    expect(code).toBe(ExitCode.Failure);
  });

  test("returns Failure when all stories fail", () => {
    const code = printReport(
      makeReport({ storiesProcessed: 2, storiesSuccess: 0, storiesFailed: 2 }),
      { verbose: false },
      false,
    );
    expect(code).toBe(ExitCode.Failure);
  });

  test("prints story details when verbose is true", () => {
    const report = makeReport({
      storiesProcessed: 1,
      storiesSuccess: 1,
      storiesFailed: 0,
      results: [
        {
          success: true,
          story: { id: "AB#1", title: "Story One", estimation: 5 } as never,
          tasksCalculated: [
            { title: "Dev task", estimation: 3, estimationPercent: 60 } as never,
          ],
          tasksCreated: [],
        },
      ],
    });

    printReport(report, { verbose: true }, false);

    const calls = consoleSpy.mock.calls.flat().join(" ");
    expect(calls).toContain("Dev task");
  });

  test("prints dry-run footer when dryRun is true", () => {
    printReport(makeReport(), { verbose: false }, true);
    const calls = consoleSpy.mock.calls.flat().join(" ");
    expect(calls).toContain("Dry run");
  });

  test("prints warnings when present", () => {
    printReport(
      makeReport({ warnings: ["estimation exceeds 100%"] }),
      { verbose: false },
      false,
    );
    const calls = consoleSpy.mock.calls.flat().join(" ");
    expect(calls).toContain("estimation exceeds 100%");
  });

  test("prints errors when present", () => {
    printReport(
      makeReport({
        storiesFailed: 1,
        errors: [{ storyId: "AB#9", error: "connection timeout" }],
      }),
      { verbose: false },
      false,
    );
    const calls = consoleSpy.mock.calls.flat().join(" ");
    expect(calls).toContain("AB#9");
    expect(calls).toContain("connection timeout");
  });
});
