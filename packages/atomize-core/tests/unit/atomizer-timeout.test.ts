import { describe, expect, test } from "bun:test";
import { Atomizer } from "@sppg2001/atomize-core/core/atomizer";
import { MockPlatformAdapter } from "@sppg2001/atomize-core/platforms/adapters/mock/mock.adapter";
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

describe("Atomizer timeout", () => {
  test("rejects at the deadline and stops starting new Task creation", async () => {
    const platform = new MockPlatformAdapter();
    await platform.authenticate();
    const storyCount = (await platform.queryWorkItems(template.filter)).length;
    expect(storyCount).toBeGreaterThan(2);

    // Querying takes ~200ms in the Mock adapter; one Story's Tasks take a few hundred more.
    await expect(
      new Atomizer(platform).atomize(template, { storyConcurrency: 1, timeoutMs: 350 }),
    ).rejects.toThrow("Generation timed out");

    await sleep(1_000);
    const createdAfterTimeout = platform.getCreatedTasks().length;
    await sleep(1_000);

    expect(platform.getCreatedTasks().length).toBe(createdAfterTimeout);
    expect(createdAfterTimeout).toBeLessThan(storyCount * template.tasks.length);
  });

  test("names no platform in the timeout message", async () => {
    const platform = new MockPlatformAdapter();
    await platform.authenticate();
    const run = new Atomizer(platform).atomize(template, { dryRun: true, timeoutMs: 1 });
    await expect(run).rejects.toThrow(/^Generation timed out after/);
    await expect(run).rejects.not.toThrow("Azure DevOps");
  });

  test("a caller's own cancel signal still applies alongside the timeout", async () => {
    const platform = new MockPlatformAdapter();
    await platform.authenticate();
    const controller = new AbortController();
    controller.abort();
    const report = await new Atomizer(platform).atomize(template, { signal: controller.signal, timeoutMs: 60_000 });
    expect(report.tasksCreated).toBe(0);
  });
});
