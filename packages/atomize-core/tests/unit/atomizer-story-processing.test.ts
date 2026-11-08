import { describe, expect, test } from "bun:test";
import { type AtomizationOptions, Atomizer, type ProgressEvent } from "@sppg2001/atomize-core/core/atomizer";
import { sanitizeReport } from "@sppg2001/atomize-core/core/report-formatter";
import type { FilterCriteria } from "@sppg2001/atomize-core/platforms/interfaces/filter.interface";
import type { GenerationPlatform } from "@sppg2001/atomize-core/platforms/interfaces/platform-capabilities";
import type { TaskDefinition, WorkItem } from "@sppg2001/atomize-core/platforms/interfaces/work-item.interface";
import type { TaskTemplate } from "@sppg2001/atomize-core/templates/schema";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const story = (id: string): WorkItem => ({ id, title: `Story ${id}`, type: "User Story", state: "New", estimation: 10 });

const template: TaskTemplate = {
  version: "1.0",
  name: "Processing",
  filter: { workItemTypes: ["User Story"] },
  tasks: [
    { id: "design", title: "Design", estimationPercent: 40 },
    { id: "build", title: "Build", estimationPercent: 60, dependsOn: ["design"] },
  ],
};

/** A platform whose Task creation for each Story takes `durations[id]` ms and fails for `failing` Stories. */
class ScriptedPlatform implements GenerationPlatform {
  readonly events: string[] = [];
  readonly links: Array<{ from: string; to: string }> = [];
  private nextId = 1;
  onStoryDone?: (storyId: string) => void;

  constructor(
    private readonly stories: WorkItem[],
    private readonly durations: Record<string, number> = {},
    private readonly failing = new Set<string>(),
  ) {}

  async getConnectUserEmail(): Promise<string> {
    return "";
  }

  async queryWorkItems(_filter: FilterCriteria): Promise<WorkItem[]> {
    return this.stories;
  }

  async createTasksBulk(
    parentId: string,
    tasks: TaskDefinition[],
    onTaskCreated?: (task: WorkItem, index: number) => void,
  ): Promise<WorkItem[]> {
    this.events.push(`start ${parentId}`);
    await sleep(this.durations[parentId] ?? 0);
    this.events.push(`end ${parentId}`);
    if (this.failing.has(parentId)) throw new Error(`failed ${parentId}`);
    const created = tasks.map((task) => ({ id: `T${this.nextId++}`, title: task.title, type: "Task", state: "New", parentId }));
    created.forEach((task, index) => {
      onTaskCreated?.(task, index);
    });
    this.onStoryDone?.(parentId);
    return created;
  }

  async createDependencyLink(from: string, to: string): Promise<void> {
    this.links.push({ from, to });
  }
}

const run = (platform: ScriptedPlatform, options: AtomizationOptions = {}) =>
  new Atomizer(platform).atomize(template, { storyConcurrency: 2, ...options });

describe("processing Stories in a Generation Run", () => {
  test("starts the next Story as soon as one finishes, without waiting for the slowest", async () => {
    const platform = new ScriptedPlatform([story("1"), story("2"), story("3")], { "1": 60, "2": 5, "3": 5 });
    await run(platform);

    expect(platform.events.indexOf("start 3")).toBeLessThan(platform.events.indexOf("end 1"));
  });

  test("keeps results in Story order and emits progress events", async () => {
    const platform = new ScriptedPlatform([story("1"), story("2"), story("3")], { "1": 30, "2": 5, "3": 5 });
    const progress: ProgressEvent[] = [];
    const report = await run(platform, { onProgress: (event) => progress.push(event) });

    expect(report.results.map((result) => result.story.id)).toEqual(["1", "2", "3"]);
    expect(progress.filter((event) => event.type === "story_start")).toHaveLength(3);
    expect(progress.filter((event) => event.type === "story_complete").map((event) => event.completedStories)).toEqual([1, 2, 3]);
  });

  test("stops starting Stories after the first error when continueOnError is false", async () => {
    const platform = new ScriptedPlatform([story("1"), story("2"), story("3"), story("4")], { "1": 5, "2": 30 }, new Set(["1"]));
    const report = await run(platform, { continueOnError: false });

    expect(platform.events).not.toContain("start 3");
    expect(report.errors.map((error) => error.storyId)).toEqual(["1"]);
    expect(report.results.map((result) => [result.story.id, result.success])).toEqual([["1", false], ["2", true]]);
  });

  test("keeps going after an error when continueOnError is true", async () => {
    const platform = new ScriptedPlatform([story("1"), story("2"), story("3")], {}, new Set(["1"]));
    const report = await run(platform, { continueOnError: true });

    expect(report.results).toHaveLength(3);
    expect(report.storiesFailed).toBe(1);
  });

  test("stops starting Stories once the signal is aborted", async () => {
    const controller = new AbortController();
    const platform = new ScriptedPlatform([story("1"), story("2"), story("3")], { "1": 5, "2": 30 });
    platform.onStoryDone = (id) => {
      if (id === "1") controller.abort();
    };
    const report = await run(platform, { signal: controller.signal });

    expect(platform.events).not.toContain("start 3");
    expect(report.results.map((result) => result.story.id)).toEqual(["1", "2"]);
  });

  test("links each Task to the Tasks it depends on", async () => {
    const platform = new ScriptedPlatform([story("1")]);
    const report = await run(platform);

    const [design, build] = report.results[0]?.tasksCreated ?? [];
    if (!design || !build) throw new Error("expected both Tasks to be created");
    expect(platform.links).toEqual([{ from: build.id, to: design.id }]);
  });

  test("rejects an invalid conditional allocation before creating any Tasks", async () => {
    const platform = new ScriptedPlatform([story("1")]);
    const invalid: TaskTemplate = {
      ...template,
      estimation: { strategy: "percentage", rounding: "none", normalize: "always" },
      validation: { taskEstimationRange: { min: 10, max: 30 } },
      tasks: [
        { title: "A", estimationPercent: 50 },
        { title: "B", estimationPercent: 50 },
      ],
    };
    const report = await new Atomizer(platform).atomize(invalid);

    expect(report.results[0]?.error).toContain("Task allocation violates");
    expect(platform.events).toEqual([]);
  });

  test("a sanitized report keeps the outcome but drops Story and Task descriptions and custom fields", async () => {
    const sensitive = { ...story("1"), description: "secret plan", customFields: { "Custom.Budget": 1000 } };
    const platform = new ScriptedPlatform([sensitive]);
    const report = sanitizeReport(await run(platform));

    const [result] = report.results;
    expect(result?.success).toBe(true);
    expect(result?.story).not.toHaveProperty("description");
    expect(result?.story).not.toHaveProperty("customFields");
    expect(result?.tasksCreated).toHaveLength(2);
  });
});

describe("stopping a Generation Run partway through a Story", () => {
  /** Creates Tasks one at a time and, like a real adapter, starts none once the signal is aborted. */
  const signalAwarePlatform = (): GenerationPlatform => {
    let nextId = 1;
    return {
      getConnectUserEmail: async () => "",
      queryWorkItems: async () => [story("1")],
      createTasksBulk: async (parentId, tasks, onTaskCreated, options) => {
        const created: WorkItem[] = [];
        for (const [index, task] of tasks.entries()) {
          if (options?.signal?.aborted) break;
          const item: WorkItem = { id: `T${nextId++}`, title: task.title, type: "Task", state: "New", parentId };
          created.push(item);
          onTaskCreated?.(item, index);
        }
        return created;
      },
    };
  };

  test("stops creating a Story's Tasks when the run is cancelled, even without link-on-create", async () => {
    const controller = new AbortController();
    const report = await new Atomizer(signalAwarePlatform()).atomize(template, {
      signal: controller.signal,
      onProgress: (event) => {
        if (event.type === "task_created") controller.abort();
      },
    });

    const [result] = report.results;
    expect(result?.tasksCreated.map((task) => task.title)).toEqual(["Design"]);
    expect(result?.stoppedEarly).toBe(true);
    expect(report.warnings).toContain("1: the run stopped after 1 of 2 Tasks were created");
  });

  test("doesn't flag a Story the run finished", async () => {
    const report = await new Atomizer(signalAwarePlatform()).atomize(template, { signal: new AbortController().signal });

    expect(report.results[0]?.tasksCreated).toHaveLength(2);
    expect(report.results[0]).not.toHaveProperty("stoppedEarly");
  });
});
