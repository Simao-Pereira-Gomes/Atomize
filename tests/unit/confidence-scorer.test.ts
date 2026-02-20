import { describe, expect, test } from "bun:test";
import type { WorkItem } from "@platforms/interfaces/work-item.interface";
import { ConfidenceScorer } from "@services/template/confidence-scorer";
import type {
  CommonTaskPattern,
  MergedTask,
  PatternDetectionResult,
  StoryAnalysis,
} from "@services/template/story-learner.types";
import type { TaskTemplate } from "@templates/schema";

function makeAnalysis(
  storyId: string,
  taskCount: number,
  storyEstimation = 20
): StoryAnalysis {
  const story: WorkItem = {
    id: storyId,
    title: `Story ${storyId}`,
    type: "User Story",
    state: "Active",
    estimation: storyEstimation,
  };

  const tasks: WorkItem[] = Array.from({ length: taskCount }, (_, i) => ({
    id: `${storyId}-t${i}`,
    title: `Task ${i + 1}`,
    type: "Task" as const,
    state: "Active",
    estimation: storyEstimation / taskCount,
  }));

  const pct = Math.round(100 / taskCount);
  const template: TaskTemplate = {
    version: "1.0",
    name: `Template from ${storyId}`,
    description: "",
    filter: { workItemTypes: ["User Story"] },
    tasks: Array.from({ length: taskCount }, (_, i) => ({
      id: `task-${i + 1}`,
      title: `Task ${i + 1}`,
      estimationPercent: i === taskCount - 1 ? 100 - pct * (taskCount - 1) : pct,
      activity: "Development",
    })),
    estimation: { strategy: "percentage", rounding: "none" },
  };

  return { story, tasks, template, warnings: [] };
}

function makeCommonTasks(
  count: number,
  frequencyRatio = 1.0
): CommonTaskPattern[] {
  return Array.from({ length: count }, (_, i) => ({
    canonicalTitle: `Task ${i + 1}`,
    titleVariants: [`Task ${i + 1}`],
    frequency: Math.round(frequencyRatio * 5),
    frequencyRatio,
    averageEstimationPercent: 25,
    estimationStdDev: 0,
    activity: "Development",
  }));
}

function makePatterns(
  overrides: Partial<PatternDetectionResult> = {}
): PatternDetectionResult {
  return {
    commonTasks: [],
    activityDistribution: { Development: 100 },
    averageTaskCount: 4,
    taskCountStdDev: 0,
    estimationPattern: {
      averageTotalEstimation: 20,
    },
    dependencyPatterns: [],
    conditionalPatterns: [],
    learnedFilters: {},
    tagDistribution: {},
    ...overrides,
  };
}

function makeMergedTasks(count: number, similarity = 1): MergedTask[] {
  return Array.from({ length: count }, (_, i) => ({
    task: {
      id: `task-${i + 1}`,
      title: `Task ${i + 1}`,
      estimationPercent: Math.round(100 / count),
    },
    sources: [{ storyId: "S1", taskTitle: `Task ${i + 1}` }],
    similarity,
  }));
}

describe("ConfidenceScorer", () => {
  const scorer = new ConfidenceScorer();

  describe("score", () => {
    test("should return low confidence for single story", () => {
      const analyses = [makeAnalysis("S1", 3)];
      const patterns = makePatterns();
      const merged = makeMergedTasks(3);

      const result = scorer.score(analyses, patterns, merged);
      expect(result.level).toBe("low");
      expect(result.overall).toBeLessThan(45);
    });

    test("should return higher confidence for many consistent stories", () => {
      const analyses = [
        makeAnalysis("S1", 4),
        makeAnalysis("S2", 4),
        makeAnalysis("S3", 4),
        makeAnalysis("S4", 4),
        makeAnalysis("S5", 4),
      ];
      // With 5 stories each having 4 tasks, provide 4 common tasks with high frequency
      const patterns = makePatterns({
        taskCountStdDev: 0,
        commonTasks: makeCommonTasks(4, 1.0), // 4 common tasks, all appear in all stories
      });
      // Merge 4 tasks from 20 original = 80% merge ratio
      const merged = makeMergedTasks(4, 1);

      const result = scorer.score(analyses, patterns, merged);
      expect(result.overall).toBeGreaterThanOrEqual(70);
      expect(result.level).toBe("high");
    });

    test("should return medium confidence for few stories with some inconsistency", () => {
      const analyses = [
        makeAnalysis("S1", 3),
        makeAnalysis("S2", 5),
        makeAnalysis("S3", 4),
      ];
      // 2 common tasks appearing in >50% of stories, avg ~4 tasks per story
      const patterns = makePatterns({
        taskCountStdDev: 2,
        commonTasks: makeCommonTasks(2, 0.67), // ~67% frequency
        estimationPattern: {
          detectedStyle: "mixed",
          averageTotalEstimation: 20,
          isConsistent: false,
        },
      });
      const merged = makeMergedTasks(4, 0.7);

      const result = scorer.score(analyses, patterns, merged);
      expect(result.level).toBe("medium");
      expect(result.overall).toBeGreaterThanOrEqual(45);
      expect(result.overall).toBeLessThan(75);
    });

    test("should produce level 'high' for score >= 75", () => {
      const analyses = Array.from({ length: 6 }, (_, i) =>
        makeAnalysis(`S${i}`, 4)
      );
      // 4 common tasks with 100% frequency ratio, avg 4 tasks = 100% task consistency
      const patterns = makePatterns({
        taskCountStdDev: 0,
        commonTasks: makeCommonTasks(4, 1.0),
      });
      const merged = makeMergedTasks(4, 1);

      const result = scorer.score(analyses, patterns, merged);
      expect(result.level).toBe("high");
    });

    test("should produce level 'low' for score < 45", () => {
      const analyses = [makeAnalysis("S1", 2)];
      const patterns = makePatterns({
        taskCountStdDev: 3,
        commonTasks: [], // No common tasks = 0% task consistency
        estimationPattern: {
          detectedStyle: "mixed",
          averageTotalEstimation: 0,
          isConsistent: false,
        },
      });
      const merged = makeMergedTasks(2, 0.3);

      const result = scorer.score(analyses, patterns, merged);
      expect(result.level).toBe("low");
    });

    test("should include all 7 factors", () => {
      const analyses = [makeAnalysis("S1", 3)];
      const patterns = makePatterns();
      const merged = makeMergedTasks(3);

      const result = scorer.score(analyses, patterns, merged);
      expect(result.factors).toHaveLength(7);

      const factorNames = result.factors.map((f) => f.name);
      expect(factorNames).toContain("Sample Size");
      expect(factorNames).toContain("Task Consistency");
      expect(factorNames).toContain("Estimation Consistency");
      expect(factorNames).toContain("Merge Quality");
      expect(factorNames).toContain("Estimation Coverage");
      expect(factorNames).toContain("Dependency Consistency");
      expect(factorNames).toContain("Condition Quality");
    });

    test("should weight sample size at 0.20", () => {
      const analyses = [makeAnalysis("S1", 3)];
      const patterns = makePatterns();
      const merged = makeMergedTasks(3);

      const result = scorer.score(analyses, patterns, merged);
      const sampleFactor = result.factors.find(
        (f) => f.name === "Sample Size"
      );
      expect(sampleFactor).toBeDefined();
      expect(sampleFactor?.weight).toBe(0.20);
    });

    test("should weight task consistency at 0.25", () => {
      const analyses = [makeAnalysis("S1", 3)];
      const patterns = makePatterns();
      const merged = makeMergedTasks(3);

      const result = scorer.score(analyses, patterns, merged);
      const factor = result.factors.find(
        (f) => f.name === "Task Consistency"
      );
      expect(factor).toBeDefined();
      expect(factor?.weight).toBe(0.25);
    });

    test("should handle empty merged tasks", () => {
      const analyses = [makeAnalysis("S1", 3)];
      const patterns = makePatterns();

      const result = scorer.score(analyses, patterns, []);
      expect(result.overall).toBeGreaterThanOrEqual(0);
      expect(result.level).toBeDefined();
    });
  });

  describe("individual factors", () => {
    test("sample size: 1 story gives ~20 score", () => {
      const analyses = [makeAnalysis("S1", 3)];
      const result = scorer.score(analyses, makePatterns(), makeMergedTasks(3));

      const factor = result.factors.find((f) => f.name === "Sample Size");
      expect(factor?.score).toBe(20);
    });

    test("sample size: 5 stories gives 80 score", () => {
      const analyses = Array.from({ length: 5 }, (_, i) =>
        makeAnalysis(`S${i}`, 3)
      );
      const result = scorer.score(analyses, makePatterns(), makeMergedTasks(3));

      const factor = result.factors.find((f) => f.name === "Sample Size");
      // 5 stories: min(90, 75 + (5-4)*5) = 80
      expect(factor?.score).toBe(80);
    });

    test("estimation consistency: single story returns default 50", () => {
      // With the new cosine similarity algorithm, 1 story returns 50 (insufficient stories)
      const patterns = makePatterns({
        estimationPattern: {
          detectedStyle: "percentage",
          averageTotalEstimation: 20,
          isConsistent: true,
        },
      });
      const result = scorer.score(
        [makeAnalysis("S1", 3)],
        patterns,
        makeMergedTasks(3)
      );

      const factor = result.factors.find(
        (f) => f.name === "Estimation Consistency"
      );
      // Single story returns default 50 for estimation consistency
      expect(factor?.score).toBe(50);
    });

    test("estimation consistency: similar distributions give high score", () => {
      // Two stories with identical task distributions should have high cosine similarity
      const analyses = [makeAnalysis("S1", 4), makeAnalysis("S2", 4)];
      const patterns = makePatterns();
      const result = scorer.score(analyses, patterns, makeMergedTasks(4));

      const factor = result.factors.find(
        (f) => f.name === "Estimation Consistency"
      );
      // Identical distributions = 100% cosine similarity
      expect(factor?.score).toBe(100);
    });

    test("task consistency: common tasks ratio determines score", () => {
      // 3 common tasks appearing in >50% of stories, avg 4 tasks per story = 75% ratio
      const analyses = [makeAnalysis("S1", 4), makeAnalysis("S2", 4)];
      const patterns = makePatterns({
        commonTasks: makeCommonTasks(3, 0.75), // 3 common tasks with >50% frequency
      });
      const result = scorer.score(analyses, patterns, makeMergedTasks(4));

      const factor = result.factors.find((f) => f.name === "Task Consistency");
      // 3 common tasks / 4 avg tasks = 75%
      expect(factor?.score).toBe(75);
    });
  });

  describe("cosine similarity", () => {
    test("identical vectors return 1", () => {
      const a = [1, 2, 3, 4];
      const b = [1, 2, 3, 4];
      expect(scorer.cosineSimilarity(a, b)).toBe(1);
    });

    test("orthogonal vectors return 0", () => {
      const a = [1, 0, 0, 0];
      const b = [0, 1, 0, 0];
      expect(scorer.cosineSimilarity(a, b)).toBe(0);
    });

    test("proportional vectors return 1", () => {
      const a = [1, 2, 3];
      const b = [2, 4, 6];
      expect(scorer.cosineSimilarity(a, b)).toBeCloseTo(1, 5);
    });

    test("zero vectors return 0", () => {
      const a = [0, 0, 0];
      const b = [0, 0, 0];
      expect(scorer.cosineSimilarity(a, b)).toBe(0);
    });
  });
});
