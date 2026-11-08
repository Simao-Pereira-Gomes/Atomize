import { describe, expect, test } from "bun:test";
import type { CalculatedTask } from "@sppg2001/atomize-core/core/estimation-calculator";
import { TaskMaterializer } from "@sppg2001/atomize-core/core/task-materializer";
import type { GenerationPlatform } from "@sppg2001/atomize-core/platforms/interfaces/platform-capabilities";
import type { TaskDefinition, WorkItem } from "@sppg2001/atomize-core/platforms/interfaces/work-item.interface";
import type { TaskDefinition as TemplateTaskDefinition } from "@sppg2001/atomize-core/templates/schema";

interface CreateCall {
  titles: string[];
  predecessors: Record<string, string[] | undefined>;
}

/** A platform that records each createTasksBulk call and can fail Tasks by title. */
function recordingPlatform(options: { linksOnCreate: boolean; failTitles?: string[] }) {
  let nextId = 100;
  const calls: CreateCall[] = [];
  const links: Array<[string, string]> = [];
  const platform: GenerationPlatform = {
    getConnectUserEmail: async () => "",
    queryWorkItems: async () => [],
    ...(options.linksOnCreate ? { createsDependencyLinksWithTasks: true as const } : {}),
    createTasksBulk: async (_parentId: string, tasks: TaskDefinition[], onTaskCreated?: (task: WorkItem, index: number) => void) => {
      calls.push({
        titles: tasks.map((t) => t.title),
        predecessors: Object.fromEntries(tasks.map((t) => [t.title, t.predecessorIds])),
      });
      const created: WorkItem[] = [];
      tasks.forEach((task, index) => {
        if (options.failTitles?.includes(task.title)) return;
        const item: WorkItem = { id: String(nextId++), title: task.title, type: "Task", state: "New" };
        created.push(item);
        onTaskCreated?.(item, index);
      });
      return created;
    },
    createDependencyLink: async (dependentId: string, predecessorId: string) => {
      links.push([dependentId, predecessorId]);
    },
  };
  return { platform, calls, links };
}

const templateTasks: TemplateTaskDefinition[] = [
  { id: "design", title: "Design", estimationPercent: 25 },
  { id: "build", title: "Build", estimationPercent: 25, dependsOn: ["design"] },
  { id: "docs", title: "Docs", estimationPercent: 25 },
  { id: "test", title: "Test", estimationPercent: 25, dependsOn: ["build", "docs"] },
] as TemplateTaskDefinition[];

const calculated = (ids: string[]): CalculatedTask[] =>
  ids.map((id) => {
    const t = templateTasks.find((task) => task.id === id);
    return { title: t?.title ?? id, templateId: id };
  });

describe("TaskMaterializer on a platform that links dependencies when creating Tasks", () => {
  test("creates Tasks one dependency level at a time, putting predecessors in the create call", async () => {
    const { platform, calls, links } = recordingPlatform({ linksOnCreate: true });

    const created = await new TaskMaterializer(platform).materialize(
      "1",
      calculated(["design", "build", "docs", "test"]),
      templateTasks,
    );

    expect(calls.map((c) => c.titles)).toEqual([["Design", "Docs"], ["Build"], ["Test"]]);
    expect(calls[0]?.predecessors).toEqual({ Design: undefined, Docs: undefined });
    expect(calls[1]?.predecessors).toEqual({ Build: ["100"] });
    expect(calls[2]?.predecessors).toEqual({ Test: ["102", "101"] });
    expect(links).toEqual([]);
    expect(created.map((t) => t.title)).toEqual(["Design", "Build", "Docs", "Test"]);
  });

  test("sends a single create call when no Task has dependencies", async () => {
    const { platform, calls } = recordingPlatform({ linksOnCreate: true });

    await new TaskMaterializer(platform).materialize("1", calculated(["design", "docs"]), templateTasks);

    expect(calls.map((c) => c.titles)).toEqual([["Design", "Docs"]]);
  });

  test("a failed predecessor leaves its dependents created, just without that link", async () => {
    const { platform, calls } = recordingPlatform({ linksOnCreate: true, failTitles: ["Design"] });

    const created = await new TaskMaterializer(platform).materialize(
      "1",
      calculated(["design", "build", "docs", "test"]),
      templateTasks,
    );

    expect(created.map((t) => t.title)).toEqual(["Build", "Docs", "Test"]);
    expect(calls[1]?.predecessors).toEqual({ Build: undefined });
    expect(calls[2]?.predecessors).toEqual({ Test: ["101", "100"] });
  });

  test("a dependency skipped by a condition doesn't hold back or link its dependent", async () => {
    const { platform, calls } = recordingPlatform({ linksOnCreate: true });

    // "design" was skipped by its condition, so "build" has nothing to wait for.
    await new TaskMaterializer(platform).materialize("1", calculated(["build", "docs"]), templateTasks);

    expect(calls.map((c) => c.titles)).toEqual([["Build", "Docs"]]);
    expect(calls[0]?.predecessors).toEqual({ Build: undefined, Docs: undefined });
  });

  test("stops before the next level once the run is cancelled, keeping the Tasks already created", async () => {
    const { platform, calls } = recordingPlatform({ linksOnCreate: true });
    const controller = new AbortController();

    const created = await new TaskMaterializer(platform).materialize(
      "1",
      calculated(["design", "build", "docs", "test"]),
      templateTasks,
      { signal: controller.signal, onTaskCreated: () => controller.abort() },
    );

    expect(calls.map((c) => c.titles)).toEqual([["Design", "Docs"]]);
    expect(created.map((t) => t.title)).toEqual(["Design", "Docs"]);
  });

  test("forwards each created Task to onTaskCreated", async () => {
    const { platform } = recordingPlatform({ linksOnCreate: true });
    const seen: string[] = [];

    await new TaskMaterializer(platform).materialize("1", calculated(["design", "build"]), templateTasks, {
      onTaskCreated: (task) => seen.push(task.title),
    });

    expect(seen).toEqual(["Design", "Build"]);
  });
});

describe("TaskMaterializer on a platform that links dependencies afterwards", () => {
  test("creates every Task in one call, then adds each link", async () => {
    const { platform, calls, links } = recordingPlatform({ linksOnCreate: false });

    await new TaskMaterializer(platform).materialize(
      "1",
      calculated(["design", "build", "docs", "test"]),
      templateTasks,
    );

    expect(calls.map((c) => c.titles)).toEqual([["Design", "Build", "Docs", "Test"]]);
    expect(links.sort()).toEqual([["101", "100"], ["103", "101"], ["103", "102"]]);
  });

  test("links the right Tasks when an earlier Task failed to create", async () => {
    const { platform, links } = recordingPlatform({ linksOnCreate: false, failTitles: ["Design"] });

    await new TaskMaterializer(platform).materialize(
      "1",
      calculated(["design", "build", "docs", "test"]),
      templateTasks,
    );

    // Build=100, Docs=101, Test=102. Build's predecessor failed, so it gets no link.
    expect(links.sort()).toEqual([["102", "100"], ["102", "101"]]);
  });
});
