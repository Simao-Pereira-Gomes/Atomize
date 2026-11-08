import { describe, expect, test } from "bun:test";
import { Atomizer } from "../../src/core/atomizer";
import { MockPlatformAdapter } from "../../src/platforms/adapters/mock/mock.adapter";
import { mockUserStories } from "../../src/platforms/adapters/mock/mock-data";
import type { TaskTemplate } from "../../src/templates/schema";
import { runPreview } from "../../src/templates/template-inspector";

const template: TaskTemplate = {
  version: "1.0",
  name: "Parity",
  filter: { workItemTypes: ["User Story"] },
  taskType: "Task",
  estimation: { strategy: "percentage", rounding: "nearest", conversion: { factor: 4 } },
  tasks: [
    { id: "design", title: `Design \${story.title}`, estimationPercent: 20 },
    { id: "build", title: "Build", estimationPercent: 50, dependsOn: ["design"] },
    { id: "api", title: "API review", estimationPercent: 30, condition: { field: "tags", operator: "contains", value: "api" } },
    { id: "ui", title: "UI review", estimationPercent: 30, condition: { field: "tags", operator: "contains", value: "ui" } },
  ],
};

describe("Mock Preview parity with a dry run on the Mock adapter", () => {
  for (const story of mockUserStories.filter((candidate) => candidate.type === "User Story").slice(0, 3)) {
    test(`Story ${story.id}: same Tasks, skipped Tasks and estimates`, async () => {
      const platform = new MockPlatformAdapter();
      await platform.authenticate();
      const report = await new Atomizer(platform).atomize(template, { dryRun: true, storyIds: [story.id] });
      const live = report.results[0];
      if (!live) throw new Error(`the Mock adapter did not return Story ${story.id}`);

      const { children: _children, ...mockStory } = story;
      const preview = await runPreview(template, JSON.stringify(mockStory));

      expect(preview.tasks.map((task) => [task.title, task.estimation])).toEqual(
        live.tasksCalculated.map((task) => [task.title, task.estimation]),
      );
      expect(preview.skippedTasks.map((task) => task.title)).toEqual((live.tasksSkipped ?? []).map((task) => task.templateTask.title));
      expect(preview.estimationSummary.storyEstimation).toBe(live.estimationSummary?.storyEstimation ?? 0);
      expect(preview.estimateUnit).toBe(live.estimateUnit);
    });
  }
});
