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

describe("Atomizer stall deadline and cancel", () => {
  test("a run that keeps making progress finishes, however much longer than the deadline it takes", async () => {
    // 8 Stories x 2 Tasks x 30 ms, one Story at a time: ~480 ms, well past a 150 ms deadline.
    const { platform, created } = timedPlatform(8, 30);

    const report = await new Atomizer(platform).atomize(template, { storyConcurrency: 1, stallTimeoutMs: 150 });

    expect(report.tasksCreated).toBe(16);
    expect(created).toHaveLength(16);
  });

  test("once the run makes no progress for the deadline, resolves with what it did and starts nothing new", async () => {
    const { platform, created } = timedPlatform(4, 5, new Set(["2"]));

    const report = await new Atomizer(platform).atomize(template, { storyConcurrency: 1, stallTimeoutMs: 100 });

    // Story 1 finished; Story 2 hangs; Stories 3 and 4 never start.
    expect(report.results.map((r) => [r.story.id, r.tasksCreated.length, r.stoppedEarly ?? false])).toEqual([
      ["1", 2, false],
      ["2", 0, true],
    ]);
    expect(report.stopped).toEqual({
      reason: "timedOut",
      message: "Generation timed out: no progress for 100 ms. No new work was started after that, and Tasks already created were kept.",
      storiesNotStarted: ["3", "4"],
    });
    expect(report.tasksCreated).toBe(2);
    await sleep(200);
    expect(created.map((task) => task.parentId)).toEqual(["1", "1"]);
  });

  test("a Story stuck part-way through keeps the Tasks it got and is marked stopped early", async () => {
    let calls = 0;
    const stories: WorkItem[] = [{ id: "1", title: "Story 1", type: "User Story", state: "New", estimation: 10 }];
    const platform: GenerationPlatform = {
      getConnectUserEmail: async () => "",
      queryWorkItems: async () => stories,
      createTasksBulk: async (parentId, tasks, onTaskCreated) => {
        for (const [index, task] of tasks.entries()) {
          if (calls++ === 1) await new Promise(() => undefined);
          onTaskCreated?.({ id: `T${index}`, title: task.title, type: "Task", state: "New", parentId }, index);
        }
        return [];
      },
    };

    const report = await new Atomizer(platform).atomize(template, { stallTimeoutMs: 50 });

    expect(report.results[0]?.tasksCreated.map((t) => t.title)).toEqual(["A"]);
    expect(report.results[0]?.stoppedEarly).toBe(true);
    expect(report.stopped?.reason).toBe("timedOut");
  });

  test("still rejects when the Story query itself stalls, since there is nothing to report", async () => {
    const platform: GenerationPlatform = {
      getConnectUserEmail: async () => "",
      queryWorkItems: () => new Promise(() => undefined),
      createTasksBulk: async () => [],
    };

    await expect(new Atomizer(platform).atomize(template, { stallTimeoutMs: 20 })).rejects.toThrow(
      "Generation timed out: no progress for 20 ms",
    );
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
    const report = await new Atomizer(platform).atomize(template, { stallTimeoutMs: 20 });
    expect(report.stopped?.message).toMatch(/^Generation timed out/);
    expect(report.stopped?.message).not.toContain("Azure DevOps");
  });

  test("a caller's own cancel signal still applies alongside the deadline", async () => {
    const { platform } = timedPlatform(3, 1);
    const controller = new AbortController();
    controller.abort();
    const report = await new Atomizer(platform).atomize(template, { signal: controller.signal, stallTimeoutMs: 60_000 });
    expect(report.tasksCreated).toBe(0);
    expect(report.stopped).toEqual({ reason: "cancelled", message: "The run was cancelled.", storiesNotStarted: ["1", "2", "3"] });
  });

  test("a run that isn't stopped has no stopped entry", async () => {
    const { platform } = timedPlatform(1, 0);
    const report = await new Atomizer(platform).atomize(template, { stallTimeoutMs: 1_000 });
    expect(report).not.toHaveProperty("stopped");
  });
});
