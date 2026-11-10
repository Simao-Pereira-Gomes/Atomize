import { describe, expect, test } from "bun:test";
import { type AtomizationOptions, Atomizer } from "@sppg2001/atomize-core/core/atomizer";
import { AZURE_DEVOPS_ESTIMATION_DEFAULTS } from "@sppg2001/atomize-core/platforms/adapters/azure-devops/estimation-defaults";
import type { FilterCriteria } from "@sppg2001/atomize-core/platforms/interfaces/filter.interface";
import type { GenerationPlatform, QueryWorkItemsOptions } from "@sppg2001/atomize-core/platforms/interfaces/platform-capabilities";
import type { TaskDefinition, WorkItem } from "@sppg2001/atomize-core/platforms/interfaces/work-item.interface";
import type { TaskTemplate } from "@sppg2001/atomize-core/templates/schema";

const child = (id: string, title: string, type = "Task"): WorkItem => ({ id, title, type, state: "New" });

const story = (id: string, children: WorkItem[] = []): WorkItem => ({
  id,
  title: `Story ${id}`,
  type: "User Story",
  state: "New",
  estimation: 10,
  children,
  childCount: children.length,
});

const template = (tasks: TaskTemplate["tasks"], extra: Partial<TaskTemplate> = {}): TaskTemplate => ({
  version: "1.0",
  name: "Resume",
  filter: { workItemTypes: ["User Story"], excludeIfHasTasks: true },
  tasks,
  ...extra,
});

/** A platform holding `stories` that records the Tasks and links Atomize writes. */
class RecordingPlatform implements GenerationPlatform {
  readonly created: Array<{ parentId: string; title: string; predecessorIds?: string[] }> = [];
  readonly links: Array<{ from: string; to: string }> = [];
  readonly queries: FilterCriteria[] = [];
  private nextId = 1;

  constructor(private readonly stories: WorkItem[]) {}

  async getConnectUserEmail(): Promise<string> {
    return "";
  }

  async queryWorkItems(filter: FilterCriteria, options?: QueryWorkItemsOptions): Promise<WorkItem[]> {
    this.queries.push(filter);
    const matching = this.stories.filter((s) => !filter.workItemIds || filter.workItemIds.includes(s.id));
    if (!filter.excludeIfHasTasks) return matching;
    for (const excluded of matching.filter((s) => (s.children ?? []).length > 0)) options?.onExcluded?.(excluded);
    return matching.filter((s) => (s.children ?? []).length === 0);
  }

  async createTasksBulk(
    parentId: string,
    tasks: TaskDefinition[],
    onTaskCreated?: (task: WorkItem, index: number) => void,
  ): Promise<WorkItem[]> {
    const created = tasks.map((task) => {
      this.created.push({ parentId, title: task.title, ...(task.predecessorIds ? { predecessorIds: task.predecessorIds } : {}) });
      return { id: `N${this.nextId++}`, title: task.title, type: "Task", state: "New", parentId };
    });
    created.forEach((task, index) => {
      onTaskCreated?.(task, index);
    });
    return created;
  }

  async createDependencyLink(from: string, to: string): Promise<void> {
    this.links.push({ from, to });
  }
}

const resume = (platform: RecordingPlatform, tmpl: TaskTemplate, options: AtomizationOptions = {}) =>
  new Atomizer(platform).atomize(tmpl, { storyIds: ["1"], resume: true, ...options });

describe("resuming a Partly Created Story", () => {
  test("creates only the planned Tasks whose title isn't already among the Story's children", async () => {
    const platform = new RecordingPlatform([story("1", [child("E1", "Design")])]);
    const tmpl = template([
      { title: "Design", estimationPercent: 30 },
      { title: "Build", estimationPercent: 50 },
      { title: "Test", estimationPercent: 20 },
    ]);

    const report = await resume(platform, tmpl);

    expect(platform.created.map((t) => t.title)).toEqual(["Build", "Test"]);
    expect(report.tasksCreated).toBe(2);
  });

  test("matches repeated and same-titled Tasks by count", async () => {
    const platform = new RecordingPlatform([
      story("1", [child("E1", "Review (1)"), child("E2", "Check")]),
    ]);
    const tmpl = template([
      { title: "Review", repeat: 3 },
      { title: "Check" },
      { title: "Check" },
    ]);

    await resume(platform, tmpl);

    expect(platform.created.map((t) => t.title)).toEqual(["Review (2)", "Review (3)", "Check"]);
  });

  test("links a new Task to an existing predecessor, and an existing dependent to a new predecessor", async () => {
    const platform = new RecordingPlatform([story("1", [child("E1", "Design"), child("E3", "Ship")])]);
    const tmpl = template([
      { id: "design", title: "Design" },
      { id: "build", title: "Build", dependsOn: ["design"] },
      { id: "ship", title: "Ship", dependsOn: ["build"] },
    ]);

    await resume(platform, tmpl);

    expect(platform.created.map((t) => t.title)).toEqual(["Build"]);
    expect(platform.links).toEqual(
      expect.arrayContaining([
        { from: "N1", to: "E1" },
        { from: "E3", to: "N1" },
      ]),
    );
    expect(platform.links).toHaveLength(2);
  });

  test("puts an existing predecessor in the new Task's create request when the platform links on create", async () => {
    const platform = new RecordingPlatform([story("1", [child("E1", "Design")])]);
    Object.assign(platform, { createsDependencyLinksWithTasks: true });
    const tmpl = template([
      { id: "design", title: "Design" },
      { id: "build", title: "Build", dependsOn: ["design"] },
    ]);

    await resume(platform, tmpl);

    expect(platform.created).toEqual([{ parentId: "1", title: "Build", predecessorIds: ["E1"] }]);
    expect(platform.links).toEqual([]);
  });

  test("leaves links between two existing Tasks alone", async () => {
    const platform = new RecordingPlatform([story("1", [child("E1", "Design"), child("E2", "Build")])]);
    const tmpl = template([
      { id: "design", title: "Design" },
      { id: "build", title: "Build", dependsOn: ["design"] },
      { title: "Docs" },
    ]);

    await resume(platform, tmpl);

    expect(platform.created.map((t) => t.title)).toEqual(["Docs"]);
    expect(platform.links).toEqual([]);
  });

  test("skips a link with a warning when two children share the predecessor's title", async () => {
    const platform = new RecordingPlatform([
      story("1", [child("E1", "Design"), child("E2", "Design")]),
    ]);
    const tmpl = template([
      { id: "design", title: "Design" },
      { id: "build", title: "Build", dependsOn: ["design"] },
    ]);

    const report = await resume(platform, tmpl);

    expect(platform.created.map((t) => t.title)).toEqual(["Build"]);
    expect(platform.links).toEqual([]);
    expect(report.warnings).toContain(
      '1: 2 child Tasks are titled "Design", so "Build" was not linked to it',
    );
  });

  test("doesn't warn about a shared title when both sides of the link already exist", async () => {
    const platform = new RecordingPlatform([
      story("1", [child("E1", "Design"), child("E2", "Design"), child("E3", "Build")]),
    ]);
    const tmpl = template([
      { id: "design", title: "Design" },
      { id: "build", title: "Build", dependsOn: ["design"] },
    ]);

    const report = await resume(platform, tmpl);

    expect(report.warnings.filter((w) => w.includes("not linked"))).toEqual([]);
  });

  test("a dry run previews each planned Task as existing or to create, and children not in the plan", async () => {
    const platform = new RecordingPlatform([story("1", [child("E1", "Design"), child("E9", "Spike")])]);
    const tmpl = template([{ title: "Design" }, { title: "Build" }]);

    const report = await resume(platform, tmpl, { dryRun: true });

    const result = report.results[0];
    expect(platform.created).toEqual([]);
    expect(result?.tasksCalculated.map((t) => t.title)).toEqual(["Build"]);
    expect(result?.resume).toEqual({
      existing: [{ title: "Design", workItemId: "E1" }],
      notInPlan: [{ title: "Spike", workItemId: "E9" }],
      complete: false,
    });
  });

  test("reports a Story whose planned Tasks all exist as already complete, and writes nothing", async () => {
    const platform = new RecordingPlatform([story("1", [child("E1", "Design"), child("E2", "Build")])]);

    const report = await resume(platform, template([{ title: "Design" }, { title: "Build" }]));

    expect(platform.created).toEqual([]);
    expect(report.results[0]?.resume?.complete).toBe(true);
    expect(report.tasksCalculated).toBe(0);
  });

  test("warns, without rebalancing, when the existing Tasks' estimates differ from the plan's", async () => {
    const estimated = (id: string, title: string, hours: number): WorkItem => ({
      ...child(id, title),
      customFields: { "Microsoft.VSTS.Scheduling.RemainingWork": hours },
    });
    const platform = new RecordingPlatform([story("1", [estimated("E1", "Design", 2)])]);
    Object.assign(platform, { getEstimationDefaults: () => AZURE_DEVOPS_ESTIMATION_DEFAULTS });
    const tmpl = template([
      { title: "Design", estimationPercent: 50 },
      { title: "Build", estimationPercent: 50 },
    ]);

    const report = await resume(platform, tmpl, { dryRun: true });

    expect(report.results[0]?.tasksCalculated.map((t) => [t.title, t.estimation])).toEqual([["Build", 5]]);
    expect(report.warnings).toContain("1: the existing Tasks' estimates total 2 hours; the plan expects 5 hours for them");
  });

  test("doesn't warn about estimates when the existing Tasks match the plan", async () => {
    const platform = new RecordingPlatform([
      story("1", [{ ...child("E1", "Design"), customFields: { "Microsoft.VSTS.Scheduling.RemainingWork": 5 } }]),
    ]);
    Object.assign(platform, { getEstimationDefaults: () => AZURE_DEVOPS_ESTIMATION_DEFAULTS });
    const tmpl = template([
      { title: "Design", estimationPercent: 50 },
      { title: "Build", estimationPercent: 50 },
    ]);

    const report = await resume(platform, tmpl, { dryRun: true });

    expect(report.warnings.filter((w) => w.includes("estimates total"))).toEqual([]);
  });

  test("asks for the Stories with their child Tasks of the Template's type, ignoring excludeIfHasTasks", async () => {
    const platform = new RecordingPlatform([story("1")]);

    await resume(platform, template([{ title: "Design" }], { taskType: "Sub-task" }));

    expect(platform.queries).toEqual([
      { workItemIds: ["1"], includeTaskChildren: true, taskWorkItemTypes: ["Sub-task"] },
    ]);
  });

  test("lists the Stories the Template matches that have Tasks too, so they can be picked to finish", async () => {
    const platform = new RecordingPlatform([story("1", [child("E1", "Design")]), story("2")]);

    const stories = await new Atomizer(platform).queryStories(template([{ title: "Design" }]), { withTasks: true });

    expect(stories.map((s) => s.id)).toEqual(["1", "2"]);
    expect(platform.queries[0]?.excludeIfHasTasks).toBeUndefined();
  });

  test("is refused without specific Story IDs", async () => {
    const platform = new RecordingPlatform([story("1")]);

    await expect(
      new Atomizer(platform).atomize(template([{ title: "Design" }]), { resume: true }),
    ).rejects.toThrow("Resume needs specific Story IDs");
    expect(platform.queries).toEqual([]);
  });
});

describe("a run with excludeIfHasTasks", () => {
  const tmpl = template([{ title: "Design" }, { title: "Build" }, { title: "Test" }]);

  test("asks only for children of the Template's Task type to count as Tasks", async () => {
    const platform = new RecordingPlatform([]);

    await new Atomizer(platform).atomize(template([{ title: "Design" }], { taskType: "Sub-task" }), { storyIds: ["1"] });

    expect(platform.queries).toEqual([{ workItemIds: ["1"], excludeIfHasTasks: true, taskWorkItemTypes: ["Sub-task"] }]);
  });

  test("reports a skipped Story that looks partly created, so it can be resumed", async () => {
    const platform = new RecordingPlatform([
      story("1", [child("E1", "Design"), child("E2", "Build")]),
      story("2"),
    ]);

    const report = await new Atomizer(platform).atomize(tmpl, { dryRun: true });

    expect(report.results.map((r) => r.story.id)).toEqual(["2"]);
    expect(report.partlyCreated).toEqual([{ storyId: "1", title: "Story 1", tasksExisting: 2, tasksPlanned: 3 }]);
    expect(report.warnings).toContain("1 skipped (excludeIfHasTasks): 2 of 3 planned Tasks exist; resume it to create the rest");
  });

  test("doesn't report a skipped Story whose children match none or all of the plan", async () => {
    const platform = new RecordingPlatform([
      story("1", [child("E1", "Hand-made split")]),
      story("2", [child("E2", "Design"), child("E3", "Build"), child("E4", "Test")]),
    ]);

    const report = await new Atomizer(platform).atomize(tmpl, { dryRun: true });

    expect(report.partlyCreated).toEqual([]);
  });
});
