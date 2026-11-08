import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { E2EWorkspace, mockStory } from "./harness";

/**
 * Covers the Generation Run and estimation changes: Mock Preview as a dry run (#315), the Atomizer
 * owning batching and Story queries (#314, #316), estimating from one reading of the Story Estimate
 * (#323, #324), and Task creation against the Mock platform (#301).
 */
type PreviewTask = { title: string; estimation?: number; estimationPercent?: number };
type PreviewJson = {
  tasks: PreviewTask[];
  skippedTasks: Array<{ title: string; reason: string }>;
  estimateUnit?: string;
  unresolvedEstimate?: { action: "blank" | "skip"; reason: string };
  estimationSummary: { storyEstimation: number; totalTaskEstimation: number; percentageUsed: number };
};
type Report = {
  storiesProcessed: number;
  storiesSuccess: number;
  storiesFailed: number;
  tasksCalculated: number;
  tasksCreated: number;
  dryRun: boolean;
  results: Array<{ story: { id: string; description?: string }; success: boolean; error?: string; tasksCalculated: PreviewTask[]; tasksCreated: unknown[] }>;
};

let ws: E2EWorkspace;
beforeEach(async () => { ws = await E2EWorkspace.create(); });
afterEach(async () => { await ws.dispose(); });

const preview = (file: string, story: Record<string, unknown>) =>
  ws.runJson<PreviewJson>(["preview", ws.file(file), "--mock-story", mockStory(story)]);

const estimates = (tasks: PreviewTask[]) => tasks.map((task) => [task.title, task.estimation]);

async function generate(file: string, ...flags: string[]): Promise<{ report: Report; exitCode: number; stdout: string }> {
  const output = join(ws.root, `report-${Math.random().toString(36).slice(2)}.json`);
  const result = await ws.run(["generate", file.startsWith("template:") ? file : ws.file(file), "--platform", "mock", "-o", output, "-q", ...flags]);
  return { report: JSON.parse(await ws.read(output)) as Report, exitCode: result.exitCode, stdout: result.stdout };
}

describe("preview --mock-story", () => {
  test("converts, distributes, repeats, conditions and fixes Task Estimates; stdout is only JSON", async () => {
    const { json, exitCode } = await preview("features.atomize.yaml", { estimation: 5, tags: ["frontend", "security"], assignedTo: "dev@example.com" });

    expect(exitCode).toBe(0);
    expect(estimates(json.tasks)).toEqual([
      ["Design Checkout", 4],
      ["Review (1)", 1],
      ["Review (2)", 1],
      ["Review (3)", 1],
      ["UI polish", 3],
      ["Sync meeting", 1],
      ["Build Checkout", 8],
      ["Security check", 2],
    ]);
    expect(json.skippedTasks).toEqual([]);
    expect(json.estimateUnit).toBe("hours");
    expect(json.estimationSummary).toEqual({ storyEstimation: 20, totalTaskEstimation: 21, percentageUsed: 105 });
  });

  test("skips a conditional Task whose condition isn't met and uses the default percent", async () => {
    const { json } = await preview("features.atomize.yaml", { estimation: 5, tags: ["backend"] });
    const percentOf = (title: string) => json.tasks.find((task) => task.title === title)?.estimationPercent;

    expect(json.skippedTasks.map((task) => task.title)).toEqual(["Security check"]);
    // Both are 5% as written, then scaled up together to fill the Story.
    expect(percentOf("UI polish")).toBe(percentOf("Review (1)"));
  });

  test("reads a t-shirt size through a table with multipliers", async () => {
    const { json } = await preview("tshirt.atomize.yaml", { customFields: { "Custom.Size": "0.5XL" } });

    expect(estimates(json.tasks)).toEqual([["Build", 6.5], ["Test", 1.5]]);
    expect(json.estimationSummary.storyEstimation).toBe(8);
  });

  test("an Unresolvable Story Estimate leaves Task Estimates blank but keeps fixed ones", async () => {
    const { json } = await preview("unresolved-blank.atomize.yaml", {});

    expect(json.unresolvedEstimate?.action).toBe("blank");
    expect(estimates(json.tasks)).toEqual([["Build", undefined], ["Fixed", 2], ["Test", undefined]]);
  });

  test("an Unresolvable Story Estimate can skip the Story", async () => {
    const { json } = await preview("unresolved-skip.atomize.yaml", {});

    expect(json.unresolvedEstimate?.action).toBe("skip");
    expect(json.tasks).toEqual([]);
  });

  test("an Unresolvable Story Estimate can fall back to the default", async () => {
    const { json } = await preview("unresolved-use-default.atomize.yaml", {});

    expect(json.unresolvedEstimate).toBeUndefined();
    expect(estimates(json.tasks)).toEqual([["Build", 3.6], ["Fixed", 2], ["Test", 2.4]]);
    expect(json.estimationSummary.storyEstimation).toBe(6);
  });

  test("normalize always scales over-allocation to 100%; never and auto keep it", async () => {
    const percents = async (file: string) =>
      (await preview(file, { estimation: 10, tags: [] })).json.tasks.map((task) => task.estimationPercent);

    expect(await percents("over-always.atomize.yaml")).toEqual([60, 40]);
    expect(await percents("over-never.atomize.yaml")).toEqual([90, 60]);
    expect(await percents("over-auto.atomize.yaml")).toEqual([90, 60]);
  });

  test("fails when the active allocation breaks taskEstimationRange", async () => {
    const result = await ws.run(["preview", ws.file("range.atomize.yaml"), "--mock-story", mockStory({ estimation: 10 })]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("taskEstimationRange");
  });

  test("rejects a Mock Story that isn't a JSON object", async () => {
    const result = await ws.run(["preview", ws.file("features.atomize.yaml"), "--mock-story", "[1,2]"]);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("JSON object");
  });

  test("--inspect lists the Story fields the Template reads", async () => {
    const { json, exitCode } = await ws.runJson<{ fields: Array<{ name: string }> }>(["preview", ws.file("tshirt.atomize.yaml"), "--inspect"]);
    expect(exitCode).toBe(0);
    expect(json.fields.map((field) => field.name)).toContain("Custom.Size");
  });

  test("previews a composed Catalog Template", async () => {
    const { json, exitCode } = await ws.runJson<PreviewJson>(["preview", "template:proj-child", "--mock-story", mockStory({ estimation: 10 })]);
    expect(exitCode).toBe(0);
    expect(json.tasks.map((task) => task.title)).toContain("Write project docs");
  });
});

describe("generate --platform mock", () => {
  test("a dry run calculates Tasks for every matching Story and creates none", async () => {
    const { report, exitCode, stdout } = await generate("features.atomize.yaml");

    expect(exitCode).toBe(0);
    expect(stdout).toContain("Dry run complete for 7 stories.");
    expect(report).toMatchObject({ dryRun: true, storiesProcessed: 7, storiesSuccess: 7, storiesFailed: 0, tasksCalculated: 50, tasksCreated: 0 });
  });

  test("--execute creates every calculated Task, Story by Story", async () => {
    const { report, exitCode } = await generate("features.atomize.yaml", "--execute", "--auto-approve");

    expect(exitCode).toBe(0);
    expect(report).toMatchObject({ dryRun: false, storiesProcessed: 7, tasksCalculated: 50, tasksCreated: 50 });
    for (const result of report.results) {
      expect(result.success).toBe(true);
      expect(result.tasksCreated).toHaveLength(result.tasksCalculated.length);
    }
  });

  test("the written report leaves out Story descriptions unless asked", async () => {
    const { report } = await generate("features.atomize.yaml");
    expect(report.results.every((result) => result.story.description === undefined)).toBe(true);
  });

  test("--story processes only the given Story, bypassing the filter", async () => {
    const { report } = await generate("features.atomize.yaml", "--story", "STORY-002");
    expect(report.results.map((result) => result.story.id)).toEqual(["STORY-002"]);
  });

  test("--limit caps the Stories processed", async () => {
    const { report } = await generate("features.atomize.yaml", "--limit", "2");
    expect(report.storiesProcessed).toBe(2);
  });

  test("Mock Preview shows the same Tasks as a dry run of the same Story", async () => {
    const { report } = await generate("features.atomize.yaml", "--story", "STORY-002");
    const live = report.results[0];
    if (!live) throw new Error("the dry run did not process STORY-002");

    const { json } = await preview("features.atomize.yaml", {
      id: "STORY-002",
      title: "Create user profile dashboard",
      state: "Active",
      estimation: 5,
      tags: ["frontend", "react", "ui"],
    });
    expect(estimates(json.tasks)).toEqual(estimates(live.tasksCalculated));
  });

  test("stops at the first failing Story, or keeps going with --continue-on-error, creating nothing for a failed one", async () => {
    // Stories tagged "api" activate a Task whose share breaks taskEstimationRange; the others are fine.
    const continuing = await generate("runtime-range.atomize.yaml", "--execute", "--auto-approve", "--continue-on-error");
    const stopping = await generate("runtime-range.atomize.yaml", "--execute", "--auto-approve");

    expect(continuing.report).toMatchObject({ storiesProcessed: 7, storiesFailed: 4, storiesSuccess: 3, tasksCreated: 12 });
    for (const result of continuing.report.results) {
      if (!result.success) {
        expect(result.error).toContain("taskEstimationRange");
        expect(result.tasksCreated).toEqual([]);
      }
    }
    expect(stopping.report.results.length).toBeLessThan(7);
  });

  test("keeps over-allocation in a non-interactive run", async () => {
    const { report, exitCode } = await generate("over-auto.atomize.yaml", "--story", "STORY-001");

    expect(exitCode).toBe(0);
    expect(report.results[0]?.tasksCalculated.map((task) => task.estimationPercent)).toEqual([90, 60]);
  });

  test("generates from a composed project Catalog Template", async () => {
    const { report, exitCode } = await generate("template:proj-child", "--story", "STORY-001");

    expect(exitCode).toBe(0);
    expect(report.results[0]?.tasksCalculated.map((task) => task.title)).toContain("Write project docs");
  });
});
