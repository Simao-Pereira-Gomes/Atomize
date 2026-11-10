import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { chmod, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AtomizationReport } from "@sppg2001/atomize-core/core/atomizer";
import { writeReportFile } from "@sppg2001/atomize-core/core/report-formatter";
import {
  buildJsonOutput,
  buildJsonStreamReportLine,
  getJsonStreamConflictError,
  getNonInteractiveLiveExecutionError,
  makeGenerateCommand,
  parseConcurrency,
  printReport,
  reportExitCode,
  resolveCommandLogLevel,
  resolveGenerateOutputPolicy,
} from "@/cli/commands/generate.command";
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
    partlyCreated: [],
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

  test("prints story-ID-specific message when no stories found via --story", () => {
    printReport(makeReport({ storiesProcessed: 0 }), { verbose: false }, false, ["123", "456"]);
    const calls = consoleSpy.mock.calls.flat().join(" ");
    expect(calls).toContain("None of the specified stories were found.");
    expect(calls).not.toContain("filter configuration");
  });

  test("prints hours rounded to two decimals, without floating-point noise", () => {
    printReport(
      makeReport({
        results: [
          {
            story: { id: "S-1", title: "Story", type: "User Story", state: "New" },
            success: true,
            tasksCalculated: [
              { title: "Review (1)", estimation: 1.3333333, estimationPercent: 10 },
              { title: "Review (2)", estimation: 1.2, estimationPercent: 10 },
            ],
            tasksCreated: [],
            estimateUnit: "hours",
            storyEstimate: 13,
            estimationSummary: { storyEstimation: 13, totalTaskEstimation: 13.000000000000002, difference: 0, percentageUsed: 100 },
          },
        ] as unknown as AtomizationReport["results"],
      }),
      { verbose: true },
      true,
    );
    const calls = consoleSpy.mock.calls.flat().join("\n");
    expect(calls).toContain("Distribution: 13 hours");
    expect(calls).toContain("Review (1): 1.33 hours");
    expect(calls).not.toContain("13.000000000000002");
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

  test("sanitizes warning output before printing", () => {
    printReport(
      makeReport({ warnings: ["bad\u001b[31m-warning"] }),
      { verbose: false },
      false,
    );
    const calls = consoleSpy.mock.calls.flat().join(" ");
    expect(calls).toContain("bad-warning");
    expect(calls).not.toContain("\u001b[31m");
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

  test("prints only concise completion output in quiet mode", () => {
    printReport(
      makeReport({ storiesProcessed: 2, storiesSuccess: 2, tasksCreated: 4 }),
      { verbose: false, quiet: true },
      false,
    );

    const calls = consoleSpy.mock.calls.flat().join(" ");
    expect(calls).toContain("Created 4 tasks for 2 stories.");
    expect(calls).not.toContain("Summary:");
    expect(calls).not.toContain("Details:");
  });

  test("prints concise failure output in quiet mode", () => {
    printReport(
      makeReport({
        storiesProcessed: 2,
        storiesSuccess: 1,
        storiesFailed: 1,
        errors: [{ storyId: "AB#9", error: "connection timeout" }],
      }),
      { verbose: true, quiet: true },
      false,
    );

    const calls = consoleSpy.mock.calls.flat().join(" ");
    expect(calls).toContain("AB#9");
    expect(calls).toContain("Generation finished with 1 failed story.");
    expect(calls).not.toContain("Summary:");
    expect(calls).not.toContain("Details:");
  });
});

describe("getNonInteractiveLiveExecutionError", () => {
  test("returns undefined for dry-run mode", () => {
    expect(
      getNonInteractiveLiveExecutionError({
        dryRun: true,
        isTTYSession: false,
        autoApprove: false,
      }),
    ).toBeUndefined();
  });

  test("returns undefined for interactive live mode", () => {
    expect(
      getNonInteractiveLiveExecutionError({
        dryRun: false,
        isTTYSession: true,
        autoApprove: false,
      }),
    ).toBeUndefined();
  });

  test("returns undefined when non-interactive live mode is explicitly acknowledged", () => {
    expect(
      getNonInteractiveLiveExecutionError({
        dryRun: false,
        isTTYSession: false,
        autoApprove: true,
      }),
    ).toBeUndefined();
  });

  test("returns an error for non-interactive live mode without --yes", () => {
    expect(
      getNonInteractiveLiveExecutionError({
        dryRun: false,
        isTTYSession: false,
        autoApprove: false,
      }),
    ).toContain("--auto-approve");
  });
});

describe("resolveCommandLogLevel", () => {
  test("defaults to environment-driven logging when no flags are set", () => {
    expect(resolveCommandLogLevel({ quiet: false, verbose: false })).toBeUndefined();
  });

  test("uses debug logging when verbose mode is enabled", () => {
    expect(resolveCommandLogLevel({ quiet: false, verbose: true })).toBe("debug");
  });

  test("uses error-only logging when quiet mode is enabled", () => {
    expect(resolveCommandLogLevel({ quiet: true, verbose: false })).toBe("error");
  });
});

describe("resolveGenerateOutputPolicy", () => {
  test("uses standard output in normal mode", () => {
    expect(resolveGenerateOutputPolicy({ quiet: false, verbose: false })).toEqual({
      quiet: false,
      verbose: false,
      logLevel: undefined,
      showStandardOutput: true,
      showVerboseOutput: false,
      showClackStatus: true,
    });
  });

  test("enables verbose output in verbose mode", () => {
    expect(resolveGenerateOutputPolicy({ quiet: false, verbose: true })).toEqual({
      quiet: false,
      verbose: true,
      logLevel: "debug",
      showStandardOutput: true,
      showVerboseOutput: true,
      showClackStatus: true,
    });
  });

  test("suppresses non-essential output in quiet mode", () => {
    expect(resolveGenerateOutputPolicy({ quiet: true, verbose: false })).toEqual({
      quiet: true,
      verbose: false,
      logLevel: "error",
      showStandardOutput: false,
      showVerboseOutput: false,
      showClackStatus: false,
    });
  });
});

describe("writeReportFile", () => {
  test("writes sanitized report data by default", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "atomize-generate-test-"));
    const outputPath = join(tempDir, "report.json");

    try {
      await writeReportFile(
        outputPath,
        makeReport({
          results: [
            {
              success: true,
              story: {
                id: "AB#1",
                title: "Story One",
                description: "secret",
                customFields: { foo: "bar" },
                platformSpecific: { raw: true },
              } as never,
              tasksCalculated: [],
              tasksCreated: [],
            },
          ],
        }),
        false,
      );

      const raw = await readFile(outputPath, "utf-8");
      expect(raw).not.toContain("secret");
      expect(raw).not.toContain("customFields");
      expect(raw).not.toContain("platformSpecific");
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  test("enforces strict file permissions where POSIX modes are supported", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "atomize-generate-test-"));
    const outputPath = join(tempDir, "report.json");

    try {
      await writeFile(outputPath, "{}", { encoding: "utf-8", mode: 0o644 });
      if (process.platform !== "win32") {
        await chmod(outputPath, 0o644);
      }

      await writeReportFile(outputPath, makeReport(), false);

      if (process.platform === "win32") {
        const raw = await readFile(outputPath, "utf-8");
        expect(raw).toContain("\"templateName\": \"test-template\"");
      } else {
        const mode = (await stat(outputPath)).mode & 0o777;
        expect(mode).toBe(0o600);
      }
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});

describe("buildJsonOutput", () => {
  test("serializes the full report as compact JSON", () => {
    const report = makeReport();
    const { stdout } = buildJsonOutput(report);
    expect(stdout).toBe(JSON.stringify(report));
  });

  test("returns exit code 0 when no stories failed", () => {
    expect(buildJsonOutput(makeReport({ storiesFailed: 0 })).exitCode).toBe(ExitCode.Success);
  });

  test("returns exit code 1 when stories failed", () => {
    expect(buildJsonOutput(makeReport({ storiesFailed: 2 })).exitCode).toBe(ExitCode.Failure);
  });
});

describe("no-match exit code across output modes (#286)", () => {
  test("every output mode exits NoMatch when no Stories matched", () => {
    const report = makeReport({ storiesProcessed: 0, storiesSuccess: 0, tasksCalculated: 0, tasksCreated: 0 });
    expect(reportExitCode(report)).toBe(ExitCode.NoMatch);
    expect(buildJsonOutput(report).exitCode).toBe(ExitCode.NoMatch);
    expect(buildJsonStreamReportLine(report).exitCode).toBe(ExitCode.NoMatch);
  });

  test("failed Stories still exit Failure in every output mode", () => {
    const report = makeReport({ storiesProcessed: 2, storiesFailed: 1 });
    expect(buildJsonOutput(report).exitCode).toBe(ExitCode.Failure);
    expect(buildJsonStreamReportLine(report).exitCode).toBe(ExitCode.Failure);
  });
});

describe("JSON output help text (#286)", () => {
  test("--json and --json-stream say they run a dry run unless --execute is passed", () => {
    const command = makeGenerateCommand(() => { throw new Error("not run"); }, {} as never, {} as never);
    for (const flag of ["--json", "--json-stream"]) {
      const description = command.options.find(option => option.long === flag)?.description ?? "";
      expect(description).toContain("Runs a dry run unless --execute is passed");
      expect(description).not.toContain("implies dry-run");
    }
  });
});

describe("buildJsonStreamReportLine", () => {
  test("wraps the report in a report envelope", () => {
    const report = makeReport();
    const { line } = buildJsonStreamReportLine(report);
    const parsed = JSON.parse(line);
    expect(parsed.event).toBe("report");
    expect(parsed.data).toEqual(report);
  });

  test("returns exit code 0 when no stories failed", () => {
    expect(buildJsonStreamReportLine(makeReport({ storiesFailed: 0 })).exitCode).toBe(ExitCode.Success);
  });

  test("returns exit code 1 when stories failed", () => {
    expect(buildJsonStreamReportLine(makeReport({ storiesFailed: 2 })).exitCode).toBe(ExitCode.Failure);
  });
});

describe("getJsonStreamConflictError", () => {
  test("returns undefined when neither flag is set", () => {
    expect(getJsonStreamConflictError({ json: false, jsonStream: false })).toBeUndefined();
  });

  test("returns undefined when only --json is set", () => {
    expect(getJsonStreamConflictError({ json: true, jsonStream: false })).toBeUndefined();
  });

  test("returns undefined when only --json-stream is set", () => {
    expect(getJsonStreamConflictError({ json: false, jsonStream: true })).toBeUndefined();
  });

  test("returns an error message when both flags are set", () => {
    const error = getJsonStreamConflictError({ json: true, jsonStream: true });
    expect(error).toContain("--json-stream");
    expect(error).toContain("--json");
  });
});

// ─── stopped and partly created Stories (#331) ───────────────────────────────

describe("printReport for a run that stopped or skipped partly created Stories", () => {
  let consoleSpy: ReturnType<typeof spyOn>;
  beforeEach(() => {
    consoleSpy = spyOn(console, "log").mockImplementation(noop);
  });
  afterEach(() => {
    consoleSpy.mockRestore();
  });
  const printed = () => consoleSpy.mock.calls.flat().join("\n");

  const stoppedReport = makeReport({
    storiesProcessed: 4,
    results: [
      {
        story: { id: "1", title: "Done", type: "User Story", state: "New" },
        success: true,
        tasksCalculated: [{ title: "A" }],
        tasksCreated: [{ id: "T1", title: "A", type: "Task", state: "New" }],
      },
      {
        story: { id: "2", title: "Half", type: "User Story", state: "New" },
        success: true,
        stoppedEarly: true,
        tasksCalculated: [{ title: "A" }, { title: "B" }, { title: "C" }],
        tasksCreated: [{ id: "T2", title: "A", type: "Task", state: "New" }],
      },
    ],
    stopped: { reason: "timedOut", message: "Generation timed out: no progress for 6 min.", storiesNotStarted: ["3", "4"] },
  });

  test("lists each Story that stopped early with the command to finish it", () => {
    printReport(stoppedReport, { verbose: false, templateRef: "template:backend-api" }, false);

    expect(printed()).toContain("Generation timed out: no progress for 6 min.");
    expect(printed()).toContain("2: Half · 1 of 3 Tasks created");
    // A Resume of a Story with no Tasks creates all of them, so one command finishes both kinds.
    expect(printed()).toContain("To finish: atomize generate template:backend-api --story 2 3 4 --resume --execute");
    expect(printed()).toContain("3, 4: not started");
  });

  test("still prints the command to finish in quiet mode", () => {
    printReport(stoppedReport, { verbose: false, quiet: true, templateRef: "./my templates/a.yaml" }, false);

    expect(printed()).toContain("To finish: atomize generate './my templates/a.yaml' --story 2 3 4 --resume --execute");
  });

  test("lists Stories skipped by excludeIfHasTasks that look partly created, with the command to resume them", () => {
    printReport(
      makeReport({
        partlyCreated: [
          { storyId: "7", title: "Login", tasksExisting: 2, tasksPlanned: 6 },
          { storyId: "8", title: "Logout", tasksExisting: 1, tasksPlanned: 6 },
        ],
      }),
      { verbose: false, templateRef: "template:backend-api" },
      true,
    );

    expect(printed()).toContain("7: Login · 2 of 6 planned Tasks exist");
    expect(printed()).toContain("To finish: atomize generate template:backend-api --story 7 8 --resume --execute");
  });

  test("lists partly created Stories even when excludeIfHasTasks skipped every Story", () => {
    const code = printReport(
      makeReport({
        storiesProcessed: 0,
        partlyCreated: [{ storyId: "7", title: "Login", tasksExisting: 2, tasksPlanned: 6 }],
      }),
      { verbose: false, templateRef: "template:backend-api" },
      true,
    );

    expect(code).toBe(ExitCode.NoMatch);
    expect(printed()).toContain("Every matching Story already has Tasks");
    expect(printed()).toContain("7: Login · 2 of 6 planned Tasks exist");
    expect(printed()).toContain("To finish: atomize generate template:backend-api --story 7 --resume --execute");
    expect(printed()).not.toContain("Check your template's filter configuration");
  });

  test("shows a resumed Story's Tasks that exist, will be created, and aren't in the plan", () => {
    printReport(
      makeReport({
        results: [
          {
            story: { id: "1", title: "Story", type: "User Story", state: "New" },
            success: true,
            tasksCalculated: [{ title: "Build", estimation: 5, estimationPercent: 50 }],
            tasksCreated: [],
            resume: {
              existing: [{ title: "Design", workItemId: "E1" }],
              notInPlan: [{ title: "Spike", workItemId: "E9" }],
              complete: false,
            },
          },
        ] as unknown as AtomizationReport["results"],
      }),
      { verbose: false },
      true,
    );

    expect(printed()).toContain("exists       Design (E1)");
    expect(printed()).toContain("will create  Build");
    expect(printed()).toContain("not in plan  Spike (E9)");
  });

  test("says when a resumed Story was already complete", () => {
    printReport(
      makeReport({
        results: [
          {
            story: { id: "1", title: "Story", type: "User Story", state: "New" },
            success: true,
            tasksCalculated: [],
            tasksCreated: [],
            resume: { existing: [{ title: "Design", workItemId: "E1" }], notInPlan: [], complete: true },
          },
        ],
      }),
      { verbose: false },
      false,
    );

    expect(printed()).toContain("Already complete: every planned Task exists");
  });
});

describe("reportExitCode for a stopped run", () => {
  test("is Stopped (4) when the run was cancelled or timed out, even with failed Stories", () => {
    const stopped = { reason: "cancelled" as const, message: "The run was cancelled.", storiesNotStarted: [] };
    expect(ExitCode.Stopped).toBe(4);
    expect(reportExitCode(makeReport({ stopped }))).toBe(ExitCode.Stopped);
    expect(reportExitCode(makeReport({ stopped, storiesFailed: 1 }))).toBe(ExitCode.Stopped);
  });
});
