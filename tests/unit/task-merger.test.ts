import { describe, expect, test } from "bun:test";
import type { WorkItem } from "@platforms/interfaces/work-item.interface";
import type {
  PatternDetectionResult,
  StoryAnalysis,
} from "@services/template/story-learner.types";
import { TaskMerger } from "@services/template/task-merger";
import type { TaskTemplate } from "@templates/schema";

function makeAnalysis(
  storyId: string,
  tasks: Array<{
    title: string;
    estimationPercent: number;
    activity?: string;
    tags?: string[];
    priority?: number;
  }>,
  storyEstimation = 20
): StoryAnalysis {
  const story: WorkItem = {
    id: storyId,
    title: `Story ${storyId}`,
    type: "User Story",
    state: "Active",
    estimation: storyEstimation,
  };

  const template: TaskTemplate = {
    version: "1.0",
    name: `Template from ${storyId}`,
    description: "",
    filter: { workItemTypes: ["User Story"] },
    tasks: tasks.map((t, i) => ({
      id: `task-${i + 1}`,
      title: t.title,
      estimationPercent: t.estimationPercent,
      activity: t.activity ?? "Development",
      tags: t.tags,
      priority: t.priority,
    })),
    estimation: { strategy: "percentage", rounding: "none" },
  };

  return {
    story,
    tasks: tasks.map((t, i) => ({
      id: `${storyId}-task-${i}`,
      title: t.title,
      type: "Task" as const,
      state: "Active",
      estimation: (t.estimationPercent / 100) * storyEstimation,
    })),
    template,
    warnings: [],
  };
}

const emptyPatterns: PatternDetectionResult = {
  commonTasks: [],
  activityDistribution: {},
  averageTaskCount: 0,
  taskCountStdDev: 0,
  estimationPattern: {
    averageTotalEstimation: 0,
  },
  dependencyPatterns: [],
  conditionalPatterns: [],
  learnedFilters: {},
  tagDistribution: {},
};

describe("TaskMerger", () => {
  const merger = new TaskMerger();

  test("should handle empty analyses array", () => {
    const result = merger.merge([], emptyPatterns);
    expect(result).toHaveLength(0);
  });

  test("should merge identical tasks from different stories", () => {
    const analyses = [
      makeAnalysis("S1", [
        { title: "Design API", estimationPercent: 30 },
        { title: "Write tests", estimationPercent: 70 },
      ]),
      makeAnalysis("S2", [
        { title: "Design API", estimationPercent: 20 },
        { title: "Write tests", estimationPercent: 80 },
      ]),
    ];

    const result = merger.merge(analyses, emptyPatterns);

    // Should merge into 2 groups, not 4 separate tasks
    expect(result).toHaveLength(2);

    const designTask = result.find((m) => m.task.title === "Design API");
    expect(designTask).toBeDefined();
    expect(designTask?.sources).toHaveLength(2);
    expect(designTask?.sources.map((s) => s.storyId)).toContain("S1");
    expect(designTask?.sources.map((s) => s.storyId)).toContain("S2");
  });

  test("should use most common estimation percentage", () => {
    const analyses = [
      makeAnalysis("S1", [
        { title: "Code review", estimationPercent: 20 },
      ]),
      makeAnalysis("S2", [
        { title: "Code review", estimationPercent: 20 },
      ]),
      makeAnalysis("S3", [
        { title: "Code review", estimationPercent: 30 },
      ]),
    ];

    const result = merger.merge(analyses, emptyPatterns);
    expect(result).toHaveLength(1);
    const mergedTask = result[0];
    // 20% appears twice, 30% appears once -> should use 20%
    expect(mergedTask?.task.estimationPercent).toBe(20);
  });

  test("should use higher value when there's a tie in frequency", () => {
    const analyses = [
      makeAnalysis("S1", [
        { title: "Code review", estimationPercent: 20 },
      ]),
      makeAnalysis("S2", [
        { title: "Code review", estimationPercent: 40 },
      ]),
    ];

    const result = merger.merge(analyses, emptyPatterns);
    expect(result).toHaveLength(1);
    const mergedTask = result[0];
    // Tie between 20 and 40 -> should use higher value (40)
    expect(mergedTask?.task.estimationPercent).toBe(40);
  });

  test("should pick canonical title from most frequent variant", () => {
    const analyses = [
      makeAnalysis("S1", [{ title: "Write unit tests", estimationPercent: 100 }]),
      makeAnalysis("S2", [{ title: "Write unit tests", estimationPercent: 100 }]),
      makeAnalysis("S3", [{ title: "Write tests", estimationPercent: 100 }]),
    ];

    const result = merger.merge(analyses, emptyPatterns);
    // "Write unit tests" appears more often
    expect(result).toHaveLength(1);
    const mergedTask = result[0];
    expect(mergedTask?.task.title).toBe("Write unit tests");
  });

  test("should take union of tags", () => {
    const analyses = [
      makeAnalysis("S1", [
        { title: "Deploy", estimationPercent: 100, tags: ["infra", "ci"] },
      ]),
      makeAnalysis("S2", [
        { title: "Deploy", estimationPercent: 100, tags: ["ci", "prod"] },
      ]),
    ];

    const result = merger.merge(analyses, emptyPatterns);
    expect(result).toHaveLength(1);
    const mergedTask = result[0];
    const tags = mergedTask?.task.tags ?? [];
    expect(tags).toContain("infra");
    expect(tags).toContain("ci");
    expect(tags).toContain("prod");
  });

  test("should use most common activity type", () => {
    const analyses = [
      makeAnalysis("S1", [
        { title: "Review code", estimationPercent: 100, activity: "Testing" },
      ]),
      makeAnalysis("S2", [
        { title: "Review code", estimationPercent: 100, activity: "Development" },
      ]),
      makeAnalysis("S3", [
        { title: "Review code", estimationPercent: 100, activity: "Development" },
      ]),
    ];

    const result = merger.merge(analyses, emptyPatterns);
    expect(result).toHaveLength(1);
    const mergedTask = result[0];
    expect(mergedTask?.task.activity).toBe("Development");
  });

  test("should track source story IDs", () => {
    const analyses = [
      makeAnalysis("STORY-1", [
        { title: "Build feature", estimationPercent: 100 },
      ]),
      makeAnalysis("STORY-2", [
        { title: "Build feature", estimationPercent: 100 },
      ]),
    ];

    const result = merger.merge(analyses, emptyPatterns);
    const mergedTask = result[0];
    expect(mergedTask?.sources).toHaveLength(2);
    const [source0, source1] = mergedTask?.sources ?? [];
    expect(source0?.storyId).toBe("STORY-1");
    expect(source1?.storyId).toBe("STORY-2");
  });

  test("should preserve unique tasks from single stories", () => {
    const analyses = [
      makeAnalysis("S1", [
        { title: "Common task", estimationPercent: 50 },
        { title: "Unique to S1", estimationPercent: 50 },
      ]),
      makeAnalysis("S2", [
        { title: "Common task", estimationPercent: 50 },
        { title: "Only in S2", estimationPercent: 50 },
      ]),
    ];

    const result = merger.merge(analyses, emptyPatterns);
    // Common task + 2 unique tasks = 3
    expect(result).toHaveLength(3);
  });

  test("should order by source count descending", () => {
    const analyses = [
      makeAnalysis("S1", [
        { title: "Rare task", estimationPercent: 30 },
        { title: "Common task", estimationPercent: 70 },
      ]),
      makeAnalysis("S2", [
        { title: "Common task", estimationPercent: 100 },
      ]),
    ];

    const result = merger.merge(analyses, emptyPatterns);
    // Common task (2 sources) should be first
    const firstTask = result[0];
    expect(firstTask?.task.title).toBe("Common task");
    expect(firstTask?.sources).toHaveLength(2);
  });
});
