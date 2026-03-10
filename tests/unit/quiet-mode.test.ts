/**
 * Tests for --quiet flag suppression.
 *
 * Verifies that non-essential output is silenced in both commands when quiet
 * mode is active, while essential output (errors, validation failures) is
 * always shown.
 */
import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { createPrinter } from "@/cli/commands/generate.command";
import { printValidSummary } from "@/cli/commands/validate.command";
import type { TaskTemplate } from "@/templates/schema";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTemplate(name = "Test Template"): TaskTemplate {
  return {
    name,
    tasks: [
      { title: "Task A", estimationPercent: 60 },
      { title: "Task B", estimationPercent: 40 },
    ],
  } as unknown as TaskTemplate;
}

// ---------------------------------------------------------------------------
// createPrinter — generate command quiet mode
// ---------------------------------------------------------------------------
describe("createPrinter", () => {
  let logSpy: ReturnType<typeof spyOn<typeof console, "log">>;

  beforeEach(() => {
    logSpy = spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  test("logs the message when quiet = false", () => {
    const print = createPrinter(false);
    print("DRY RUN MODE - No tasks will be created");
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalledWith("DRY RUN MODE - No tasks will be created");
  });

  test("suppresses the message when quiet = true", () => {
    const print = createPrinter(true);
    print("DRY RUN MODE - No tasks will be created");
    expect(logSpy).not.toHaveBeenCalled();
  });

  test("suppresses every call when quiet = true", () => {
    const print = createPrinter(true);
    print("line 1");
    print("line 2");
    print("line 3");
    expect(logSpy).not.toHaveBeenCalled();
  });

  test("logs every call when quiet = false", () => {
    const print = createPrinter(false);
    print("line 1");
    print("line 2");
    expect(logSpy).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// printValidSummary — validate command quiet mode
// ---------------------------------------------------------------------------
describe("printValidSummary", () => {
  let logSpy: ReturnType<typeof spyOn<typeof console, "log">>;

  beforeEach(() => {
    logSpy = spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  test("always prints the valid/mode headline regardless of quiet flag", () => {
    const template = makeTemplate();
    printValidSummary(template, [], "lenient", true);

    const allCalls = logSpy.mock.calls.flat().join(" ");
    // The "valid" headline is always shown — it's not suppressed by quiet
    expect(allCalls).toMatch(/valid/i);
  });

  test("prints the Summary block when quiet = false", () => {
    const template = makeTemplate("My Template");
    printValidSummary(template, [], "lenient", false);

    const allCalls = logSpy.mock.calls.flat().join(" ");
    expect(allCalls).toContain("Summary:");
  });

  test("suppresses the Summary block when quiet = true", () => {
    const template = makeTemplate("My Template");
    printValidSummary(template, [], "lenient", true);

    const allCalls = logSpy.mock.calls.flat().join(" ");
    expect(allCalls).not.toContain("Summary:");
  });

  test("suppresses template name, task count and estimation in quiet mode", () => {
    const template = makeTemplate("My Template");
    printValidSummary(template, [], "lenient", true);

    const allCalls = logSpy.mock.calls.flat().join(" ");
    expect(allCalls).not.toContain("My Template");
    expect(allCalls).not.toContain("Tasks:");
    expect(allCalls).not.toContain("Total Estimation:");
  });

  test("prints template name, task count and estimation when not quiet", () => {
    const template = makeTemplate("My Template");
    printValidSummary(template, [], "lenient", false);

    const allCalls = logSpy.mock.calls.flat().join(" ");
    expect(allCalls).toContain("My Template");
  });

  test("treats undefined quiet as non-quiet (shows summary by default)", () => {
    const template = makeTemplate("My Template");
    printValidSummary(template, [], "lenient");

    const allCalls = logSpy.mock.calls.flat().join(" ");
    expect(allCalls).toContain("Summary:");
  });

  test("shows warnings when quiet = false and warnings exist", () => {
    const template = makeTemplate();
    const warnings = [{ path: "tasks[0]", message: "low estimation" }];
    printValidSummary(template, warnings, "lenient", false);

    const allCalls = logSpy.mock.calls.flat().join(" ");
    expect(allCalls).toContain("low estimation");
  });

  test("suppresses warnings together with summary when quiet = true", () => {
    const template = makeTemplate();
    const warnings = [{ path: "tasks[0]", message: "low estimation" }];
    printValidSummary(template, warnings, "lenient", true);

    const allCalls = logSpy.mock.calls.flat().join(" ");
    expect(allCalls).not.toContain("low estimation");
  });

  test("shows [Strict] label in the headline when mode is strict", () => {
    const template = makeTemplate();
    printValidSummary(template, [], "strict", true);

    const allCalls = logSpy.mock.calls.flat().join(" ");
    expect(allCalls).toContain("[Strict]");
  });

  test("shows [Lenient] label in the headline when mode is lenient", () => {
    const template = makeTemplate();
    printValidSummary(template, [], "lenient", true);

    const allCalls = logSpy.mock.calls.flat().join(" ");
    expect(allCalls).toContain("[Lenient]");
  });
});
