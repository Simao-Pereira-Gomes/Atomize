import { describe, expect, test } from "bun:test";
import { Atomizer } from "@sppg2001/atomize-core/core/atomizer";
import type { GenerationPlatform } from "@sppg2001/atomize-core/platforms/interfaces/platform-capabilities";
import type { WorkItem } from "@sppg2001/atomize-core/platforms/interfaces/work-item.interface";
import type { TaskTemplate } from "@sppg2001/atomize-core/templates/schema";

const template: TaskTemplate = {
  version: "1.0",
  name: "Timeout",
  filter: { workItemTypes: ["User Story"] },
  tasks: [
    { id: "a", title: "A", estimationPercent: 50 },
    { id: "b", title: "B", estimationPercent: 50 },
  ],
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Stories whose Tasks each take `taskMs` to create. A Story listed in `hangOn` never finishes
 * creating its Tasks, standing in for an Azure DevOps request that never comes back.
 */
function timedPlatform(storyCount: number, taskMs: number, hangOn = new Set<string>()) {
  const created: WorkItem[] = [];
  const stories: WorkItem[] = Array.from({ length: storyCount }, (_, i) => ({
    id: String(i + 1),
    title: `Story ${i + 1}`,
    type: "User Story",
    state: "New",
    estimation: 10,
  }));
  const platform: GenerationPlatform = {
    getConnectUserEmail: async () => "",
    queryWorkItems: async () => stories,
    createTasksBulk: async (parentId, tasks, onTaskCreated, options) => {
      if (hangOn.has(parentId)) await new Promise(() => undefined);
      const done: WorkItem[] = [];
      for (const [index, task] of tasks.entries()) {
        if (options?.signal?.aborted) break;
        await sleep(taskMs);
        const item: WorkItem = { id: `T${created.length + 1}`, title: task.title, type: "Task", state: "New", parentId };
        created.push(item);
        done.push(item);
        onTaskCreated?.(item, index);
      }
      return done;
    },
  };
  return { platform, created };
}

describe("Atomizer stall deadline", () => {
  test("a run that keeps making progress finishes, however much longer than the deadline it takes", async () => {
    // 8 Stories x 2 Tasks x 30 ms, one Story at a time: ~480 ms, well past a 150 ms deadline.
    const { platform, created } = timedPlatform(8, 30);

    const report = await new Atomizer(platform).atomize(template, { storyConcurrency: 1, stallTimeoutMs: 150 });

    expect(report.tasksCreated).toBe(16);
    expect(created).toHaveLength(16);
  });

  test("rejects once the run makes no progress for the deadline, and starts nothing new after it", async () => {
    const { platform, created } = timedPlatform(4, 5, new Set(["2"]));

    await expect(
      new Atomizer(platform).atomize(template, { storyConcurrency: 1, stallTimeoutMs: 100 }),
    ).rejects.toThrow("Generation timed out: no progress for 100 ms");

    // Story 1 finished; Story 2 hangs; Stories 3 and 4 never start.
    await sleep(200);
    expect(created.map((task) => task.parentId)).toEqual(["1", "1"]);
  });

  test("still reports progress to the caller", async () => {
    const { platform } = timedPlatform(2, 1);
    const types: string[] = [];

    await new Atomizer(platform).atomize(template, { stallTimeoutMs: 1_000, onProgress: (event) => types.push(event.type) });

    expect(types).toContain("query_complete");
    expect(types.filter((type) => type === "task_created")).toHaveLength(4);
  });

  test("names no platform in the timeout message", async () => {
    const { platform } = timedPlatform(1, 0, new Set(["1"]));
    const run = new Atomizer(platform).atomize(template, { stallTimeoutMs: 20 });
    await expect(run).rejects.toThrow(/^Generation timed out/);
    await expect(run).rejects.not.toThrow("Azure DevOps");
  });

  test("a caller's own cancel signal still applies alongside the deadline", async () => {
    const { platform } = timedPlatform(3, 1);
    const controller = new AbortController();
    controller.abort();
    const report = await new Atomizer(platform).atomize(template, { signal: controller.signal, stallTimeoutMs: 60_000 });
    expect(report.tasksCreated).toBe(0);
  });
});
