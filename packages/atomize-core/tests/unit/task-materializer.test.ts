import { describe, expect, test } from "bun:test";
import type { CalculatedTask } from "@sppg2001/atomize-core/core/estimation-calculator";
import { TaskMaterializer } from "@sppg2001/atomize-core/core/task-materializer";
import type { GenerationPlatform } from "@sppg2001/atomize-core/platforms/interfaces/platform-capabilities";
import type { TaskDefinition, WorkItem } from "@sppg2001/atomize-core/platforms/interfaces/work-item.interface";
import type { TaskDefinition as TemplateTaskDefinition } from "@sppg2001/atomize-core/templates/schema";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface PlatformOptions {
  linksOnCreate: boolean;
  /** Platforms that link on create may still lack a separate link call. */
  separateLinks?: boolean;
  taskConcurrency?: number;
  failTitles?: string[];
  delayMs?: Record<string, number>;
}

/** A platform that records each Task it creates (with its predecessors), each link, and the order of events. */
function recordingPlatform(options: PlatformOptions) {
  let nextId = 100;
  let inFlight = 0;
  let peak = 0;
  const calls: string[][] = [];
  const predecessors: Record<string, string[] | undefined> = {};
  const links: Array<[string, string]> = [];
  const events: string[] = [];
  const platform: GenerationPlatform = {
    getConnectUserEmail: async () => "",
    queryWorkItems: async () => [],
    ...(options.linksOnCreate ? { createsDependencyLinksWithTasks: true as const } : {}),
    ...(options.taskConcurrency !== undefined ? { taskConcurrency: options.taskConcurrency } : {}),
    createTasksBulk: async (_parentId: string, tasks: TaskDefinition[], onTaskCreated?: (task: WorkItem, index: number) => void) => {
      calls.push(tasks.map((t) => t.title));
      const created: WorkItem[] = [];
      await Promise.all(
        tasks.map(async (task, index) => {
          predecessors[task.title] = task.predecessorIds;
          events.push(`start ${task.title}`);
          inFlight++;
          peak = Math.max(peak, inFlight);
          await sleep(options.delayMs?.[task.title] ?? 0);
          inFlight--;
          events.push(`end ${task.title}`);
          if (options.failTitles?.includes(task.title)) return;
          const item: WorkItem = { id: String(nextId++), title: task.title, type: "Task", state: "New" };
          created.push(item);
          onTaskCreated?.(item, index);
        }),
      );
      return created;
    },
    ...(options.separateLinks === false
      ? {}
      : {
          createDependencyLink: async (dependentId: string, predecessorId: string) => {
            links.push([dependentId, predecessorId]);
          },
        }),
  };
  return { platform, calls, predecessors, links, events, peak: () => peak };
}

const templateTasks = [
  { id: "design", title: "Design", estimationPercent: 25 },
  { id: "build", title: "Build", estimationPercent: 25, dependsOn: ["design"] },
  { id: "docs", title: "Docs", estimationPercent: 25 },
  { id: "test", title: "Test", estimationPercent: 25, dependsOn: ["build", "docs"] },
] as TemplateTaskDefinition[];

const chainTasks = ["a", "b", "c", "d", "e", "f"].map((id, index, ids) => ({
  id,
  title: id.toUpperCase(),
  estimationPercent: 10,
  ...(index > 0 ? { dependsOn: [ids[index - 1]] } : {}),
})) as TemplateTaskDefinition[];

const calculated = (ids: string[], tasks = templateTasks): CalculatedTask[] =>
  ids.map((id) => ({ title: tasks.find((task) => task.id === id)?.title ?? id, templateId: id }));

const all = ["design", "build", "docs", "test"];

describe("TaskMaterializer linking dependencies when creating Tasks", () => {
  // One Task at a time makes create-then-link slow (4 + 3 rounds), so linking on create wins (3 rounds).
  const linksOnCreate = { linksOnCreate: true, taskConcurrency: 1 } as const;

  test("puts each Task's created predecessors in its create request and sends no separate links", async () => {
    const { platform, predecessors, links } = recordingPlatform(linksOnCreate);

    const created = await new TaskMaterializer(platform).materialize("1", calculated(all), templateTasks, {
      dependencyConcurrency: 1,
    });

    // One at a time, Build is ready (and starts) before Docs: Design=100, Build=101, Docs=102.
    expect(predecessors).toEqual({ Design: undefined, Build: ["100"], Docs: undefined, Test: ["101", "102"] });
    expect(links).toEqual([]);
    expect(created.map((t) => t.title)).toEqual(["Design", "Build", "Docs", "Test"]);
  });

  test("starts a Task as soon as its own predecessors exist, not when every earlier-level Task is done", async () => {
    // Build waits only for Design; the slow Docs shouldn't hold it back.
    const { platform, events } = recordingPlatform({ linksOnCreate: true, delayMs: { Docs: 60, Design: 5 } });

    await new TaskMaterializer(platform).materialize("1", calculated(["design", "build", "docs"]), templateTasks);

    expect(events.indexOf("start Build")).toBeLessThan(events.indexOf("end Docs"));
  });

  test("never has more Tasks in flight than the platform's Task concurrency", async () => {
    const ids = ["a", "b", "c", "d", "e", "f"];
    const tasks = ids.map((id) => ({ id, title: id, estimationPercent: 10, ...(id === "f" ? { dependsOn: ["a"] } : {}) })) as TemplateTaskDefinition[];
    const delayMs = Object.fromEntries(ids.map((id) => [id, 5]));
    const { platform, peak } = recordingPlatform({ linksOnCreate: true, taskConcurrency: 2, delayMs });

    await new TaskMaterializer(platform).materialize("1", calculated(ids, tasks), tasks);

    expect(peak()).toBe(2);
  });

  test("a failed predecessor leaves its dependents created, just without that link", async () => {
    const { platform, predecessors } = recordingPlatform({ ...linksOnCreate, failTitles: ["Design"] });

    const created = await new TaskMaterializer(platform).materialize("1", calculated(all), templateTasks, {
      dependencyConcurrency: 1,
    });

    expect(created.map((t) => t.title)).toEqual(["Build", "Docs", "Test"]);
    expect(predecessors.Build).toBeUndefined();
    // Design failed, so Build=100 and Docs=101.
    expect(predecessors.Test).toEqual(["100", "101"]);
  });

  test("a dependency skipped by a condition doesn't hold back or link its dependent", async () => {
    const { platform, predecessors } = recordingPlatform(linksOnCreate);

    await new TaskMaterializer(platform).materialize("1", calculated(["build", "docs"]), templateTasks);

    expect(predecessors).toEqual({ Build: undefined, Docs: undefined });
  });

  test("stops starting Tasks once the run is cancelled, keeping the Tasks already created", async () => {
    const { platform, calls } = recordingPlatform(linksOnCreate);
    const controller = new AbortController();

    const created = await new TaskMaterializer(platform).materialize("1", calculated(all), templateTasks, {
      dependencyConcurrency: 1,
      signal: controller.signal,
      onTaskCreated: () => controller.abort(),
    });

    expect(calls).toEqual([["Design"]]);
    expect(created.map((t) => t.title)).toEqual(["Design"]);
  });

  test("forwards each created Task to onTaskCreated", async () => {
    const { platform } = recordingPlatform(linksOnCreate);
    const seen: string[] = [];

    await new TaskMaterializer(platform).materialize("1", calculated(["design", "build"]), templateTasks, {
      onTaskCreated: (task) => seen.push(task.title),
    });

    expect(seen).toEqual(["Design", "Build"]);
  });
});

describe("TaskMaterializer choosing how to link dependencies", () => {
  test("creates a long chain all at once and links it afterwards, since waiting on each Task would be slower", async () => {
    // 6 levels in sequence versus 2 rounds of creates (6 Tasks, 5 at a time) plus 1 round of 5 links.
    const { platform, calls, predecessors, links } = recordingPlatform({ linksOnCreate: true, taskConcurrency: 5 });

    await new TaskMaterializer(platform).materialize("1", calculated(["a", "b", "c", "d", "e", "f"], chainTasks), chainTasks, {
      dependencyConcurrency: 5,
    });

    expect(calls).toEqual([["A", "B", "C", "D", "E", "F"]]);
    expect(Object.values(predecessors).every((ids) => ids === undefined)).toBe(true);
    expect(links).toHaveLength(5);
  });

  test("links on create when the chain is no longer than create-then-link would take", async () => {
    // 2 levels versus 1 round of creates plus 1 round of links: a tie goes to fewer requests.
    const { platform, links, predecessors } = recordingPlatform({ linksOnCreate: true, taskConcurrency: 5 });

    await new TaskMaterializer(platform).materialize("1", calculated(["design", "build", "docs"]), templateTasks, {
      dependencyConcurrency: 5,
    });

    expect(links).toEqual([]);
    expect(predecessors.Build).toEqual(["100"]);
  });

  test("links on create even for a long chain when the platform can't link Tasks afterwards", async () => {
    const { platform, predecessors } = recordingPlatform({ linksOnCreate: true, separateLinks: false, taskConcurrency: 5 });

    await new TaskMaterializer(platform).materialize("1", calculated(["a", "b", "c", "d", "e", "f"], chainTasks), chainTasks);

    expect(predecessors.F).toEqual(["104"]);
  });
});

describe("TaskMaterializer on a platform that links dependencies afterwards", () => {
  test("creates every Task in one call, then adds each link", async () => {
    const { platform, calls, links } = recordingPlatform({ linksOnCreate: false });

    await new TaskMaterializer(platform).materialize("1", calculated(all), templateTasks);

    expect(calls).toEqual([["Design", "Build", "Docs", "Test"]]);
    expect(links.sort()).toEqual([["101", "100"], ["103", "101"], ["103", "102"]]);
  });

  test("links the right Tasks when an earlier Task failed to create", async () => {
    const { platform, links } = recordingPlatform({ linksOnCreate: false, failTitles: ["Design"] });

    await new TaskMaterializer(platform).materialize("1", calculated(all), templateTasks);

    // Build=100, Docs=101, Test=102. Build's predecessor failed, so it gets no link.
    expect(links.sort()).toEqual([["102", "100"], ["102", "101"]]);
  });
});
