import { describe, expect, test } from "bun:test";
import type { WorkItem } from "@platforms/interfaces/work-item.interface";
import { OutlierDetector } from "@services/template/confidence-analysis";
import type {
  PatternDetectionResult,
  StoryAnalysis,
} from "@services/template/story-learner.types";
import type { TaskTemplate } from "@templates/schema";

function makeAnalysis(
  storyId: string,
  taskTitles: string[],
  storyEstimation = 20
): StoryAnalysis {
  const story: WorkItem = {
    id: storyId,
    title: `Story ${storyId}`,
    type: "User Story",
    state: "Active",
    estimation: storyEstimation,
  };

  const pct = taskTitles.length > 0 ? Math.round(100 / taskTitles.length) : 0;
  const tasks: WorkItem[] = taskTitles.map((title, i) => ({
    id: `${storyId}-t${i}`,
    title,
    type: "Task" as const,
    state: "Active",
    estimation: storyEstimation / Math.max(taskTitles.length, 1),
  }));

  const template: TaskTemplate = {
    version: "1.0",
    name: `Template from ${storyId}`,
    description: "",
    filter: { workItemTypes: ["User Story"] },
    tasks: taskTitles.map((title, i) => ({
      id: `task-${i + 1}`,
      title,
      estimationPercent:
        i === taskTitles.length - 1 ? 100 - pct * (taskTitles.length - 1) : pct,
      activity: "Development",
    })),
    estimation: { strategy: "percentage", rounding: "none" },
  };

  return { story, tasks, template, warnings: [] };
}

function makePatterns(
  commonTasks: Array<{
    title: string;
    frequencyRatio: number;
    variants?: string[];
  }> = []
): PatternDetectionResult {
  return {
    commonTasks: commonTasks.map((t) => ({
      canonicalTitle: t.title,
      titleVariants: t.variants ?? [t.title],
      frequency: Math.round(t.frequencyRatio * 5),
      frequencyRatio: t.frequencyRatio,
      averageEstimationPercent: 25,
      estimationStdDev: 5,
      activity: "Development",
    })),
    activityDistribution: { Development: 100 },
    averageTaskCount: 4,
    taskCountStdDev: 0.5,
    estimationPattern: {
      averageTotalEstimation: 20,
    },
    dependencyPatterns: [],
    conditionalPatterns: [],
    learnedFilters: {},
    tagDistribution: {},
  };
}

describe("OutlierDetector", () => {
  const detector = new OutlierDetector();

  test("should return empty array for less than 2 analyses", () => {
    const analyses = [makeAnalysis("S1", ["A", "B"])];
    const result = detector.detect(analyses, makePatterns());
    expect(result).toHaveLength(0);
  });

  test("should return empty array when no outliers exist", () => {
    const analyses = [
      makeAnalysis("S1", ["A", "B", "C"], 20),
      makeAnalysis("S2", ["A", "B", "C"], 21),
      makeAnalysis("S3", ["A", "B", "C"], 19),
      makeAnalysis("S4", ["A", "B", "C"], 20),
    ];

    const result = detector.detect(analyses, makePatterns());
    // No outliers expected with consistent data
    const estimationOutliers = result.filter((o) => o.type === "estimation");
    const taskCountOutliers = result.filter((o) => o.type === "task-count");
    expect(estimationOutliers).toHaveLength(0);
    expect(taskCountOutliers).toHaveLength(0);
  });

  test("should find estimation outliers using MAD-based modified Z-score", () => {
    // Need varied data so MAD > 0, with a clear outlier
    // Values: [10, 12, 14, 16, 100]
    // Median = 14, Deviations = [4, 2, 0, 2, 86], Sorted = [0, 2, 2, 4, 86], MAD = 2
    // ModifiedZ for 100: 0.6745 * (100-14) / 2 = 0.6745 * 43 = 29 >> 3.5
    const analyses = [
      makeAnalysis("S1", ["A", "B"], 10),
      makeAnalysis("S2", ["A", "B"], 12),
      makeAnalysis("S3", ["A", "B"], 14),
      makeAnalysis("S4", ["A", "B"], 16),
      makeAnalysis("S5", ["A", "B"], 100), // clear outlier
    ];

    const result = detector.detect(analyses, makePatterns());
    const estimationOutliers = result.filter((o) => o.type === "estimation");
    expect(estimationOutliers.length).toBeGreaterThanOrEqual(1);
    expect(estimationOutliers.some((o) => o.storyId === "S5")).toBe(true);
    // Check severity is included
    expect(estimationOutliers[0]?.severity).toBeGreaterThan(0);
  });

  test("should find task count outliers", () => {
    // Need varied task counts so MAD > 0, with a clear outlier
    // Task counts: [3, 4, 5, 6, 20]
    // Median = 5, Deviations = [2, 1, 0, 1, 15], Sorted = [0, 1, 1, 2, 15], MAD = 1
    // ModifiedZ for 20: 0.6745 * (20-5) / 1 = 10.1 >> 3.5
    const analyses = [
      makeAnalysis("S1", ["A", "B", "C"]),
      makeAnalysis("S2", ["A", "B", "C", "D"]),
      makeAnalysis("S3", ["A", "B", "C", "D", "E"]),
      makeAnalysis("S4", ["A", "B", "C", "D", "E", "F"]),
      makeAnalysis("S5", Array.from({ length: 20 }, (_, i) => `T${i}`)), // clear outlier: 20 tasks
    ];

    const result = detector.detect(analyses, makePatterns());
    const taskCountOutliers = result.filter((o) => o.type === "task-count");
    expect(taskCountOutliers.length).toBeGreaterThanOrEqual(1);
    expect(taskCountOutliers.some((o) => o.storyId === "S5")).toBe(true);
    // Check severity is included
    expect(taskCountOutliers[0]?.severity).toBeGreaterThan(0);
  });

  test("should detect stories missing common tasks", () => {
    const patterns = makePatterns([
      { title: "Design", frequencyRatio: 1.0, variants: ["Design"] },
      { title: "Test", frequencyRatio: 0.8, variants: ["Test"] },
    ]);

    const analyses = [
      makeAnalysis("S1", ["Design", "Test", "Code"]),
      makeAnalysis("S2", ["Code"]), // Missing "Design" and "Test"
    ];

    const result = detector.detect(analyses, patterns);
    const missingOutliers = result.filter((o) => o.type === "missing-task");
    expect(missingOutliers.length).toBeGreaterThanOrEqual(1);
    expect(missingOutliers.some((o) => o.storyId === "S2")).toBe(true);
    // Check severity is included (based on frequency ratio)
    expect(missingOutliers[0]?.severity).toBeGreaterThan(0);
  });

  test("should detect extra tasks unique to one story", () => {
    const patterns = makePatterns([
      { title: "Common task", frequencyRatio: 1.0 },
      { title: "Rare special task", frequencyRatio: 0.1 },
    ]);

    const analyses = [
      makeAnalysis("S1", ["Common task"]),
      makeAnalysis("S2", ["Common task", "Rare special task"]),
    ];

    const result = detector.detect(analyses, patterns);
    const extraOutliers = result.filter((o) => o.type === "extra-task");
    // "Rare special task" should be flagged
    expect(extraOutliers.length).toBeGreaterThanOrEqual(1);
    // Check severity is included (based on rarity)
    expect(extraOutliers[0]?.severity).toBeGreaterThan(0);
  });

  test("should handle identical values (MAD = 0) gracefully", () => {
    // When all values are identical, MAD = 0 and no outliers should be detected
    const analyses = [
      makeAnalysis("S1", ["A", "B"], 10),
      makeAnalysis("S2", ["A", "B"], 10),
      makeAnalysis("S3", ["A", "B"], 10),
    ];

    const result = detector.detect(analyses, makePatterns());
    const estimationOutliers = result.filter((o) => o.type === "estimation");
    const taskCountOutliers = result.filter((o) => o.type === "task-count");
    expect(estimationOutliers).toHaveLength(0);
    expect(taskCountOutliers).toHaveLength(0);
  });

  describe("MAD calculations", () => {
    test("calculateMAD returns correct median and MAD for odd-length array", () => {
      const values = [1, 2, 3, 4, 5];
      // Median = 3, Deviations = [2, 1, 0, 1, 2], Sorted = [0, 1, 1, 2, 2], MAD = 1
      const { median, mad } = detector.calculateMAD(values);
      expect(median).toBe(3);
      expect(mad).toBe(1);
    });

    test("calculateMAD returns correct median and MAD for even-length array", () => {
      const values = [1, 2, 4, 5];
      // Median = (2+4)/2 = 3, Deviations = [2, 1, 1, 2], Sorted = [1, 1, 2, 2], MAD = (1+2)/2 = 1.5
      const { median, mad } = detector.calculateMAD(values);
      expect(median).toBe(3);
      expect(mad).toBe(1.5);
    });

    test("calculateMAD returns 0 MAD for identical values", () => {
      const values = [5, 5, 5, 5];
      const { median, mad } = detector.calculateMAD(values);
      expect(median).toBe(5);
      expect(mad).toBe(0);
    });

    test("modifiedZScore returns 0 when MAD is 0", () => {
      const result = detector.modifiedZScore(100, 50, 0);
      expect(result).toBe(0);
    });

    test("modifiedZScore calculates correctly with non-zero MAD", () => {
      // modifiedZ = 0.6745 * (value - median) / mad
      // = 0.6745 * (20 - 10) / 2 = 0.6745 * 5 = 3.3725
      const result = detector.modifiedZScore(20, 10, 2);
      expect(result).toBeCloseTo(3.3725, 3);
    });
  });
});
