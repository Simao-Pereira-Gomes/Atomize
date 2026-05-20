import { describe, expect, test } from "bun:test";
import type { WorkItem } from "@platforms/interfaces/work-item.interface";
import { PatternDetector } from "@services/template/pattern-detection";
import type { StoryAnalysis } from "@services/template/story-learner.types";
import type { TaskTemplate } from "@templates/schema";

function makeStory(id: string, estimation = 20): WorkItem {
  return {
    id,
    title: `Story ${id}`,
    type: "User Story",
    state: "Active",
    estimation,
  };
}

function makeTemplate(
  storyId: string,
  tasks: Array<{ title: string; estimationPercent: number; activity?: string }>,
): TaskTemplate {
  return {
    version: "1.0",
    name: `Template from ${storyId}`,
    description: "",
    filter: { workItemTypes: ["User Story"] },
    tasks: tasks.map((t, i) => ({
      id: `task-${i + 1}`,
      title: t.title,
      estimationPercent: t.estimationPercent,
      activity: t.activity ?? "Development",
    })),
    estimation: { strategy: "percentage", rounding: "none" },
  };
}

function makeAnalysis(
  storyId: string,
  tasks: Array<{ title: string; estimationPercent: number; activity?: string }>,
  storyEstimation = 20,
): StoryAnalysis {
  const story = makeStory(storyId, storyEstimation);
  return {
    story,
    tasks: tasks.map((t, i) => ({
      id: `${storyId}-task-${i}`,
      title: t.title,
      type: "Task" as const,
      state: "Active",
      estimation: (t.estimationPercent / 100) * storyEstimation,
    })),
    template: makeTemplate(storyId, tasks),
    warnings: [],
  };
}

describe("PatternDetector", () => {
  const detector = new PatternDetector();

  describe("detect", () => {
    test("should return empty result for empty analyses", () => {
      const result = detector.detect([]);
      expect(result.commonTasks).toHaveLength(0);
      expect(result.averageTaskCount).toBe(0);
      expect(result.taskCountStdDev).toBe(0);
    });

    test("should find common tasks across analyses", () => {
      const analyses = [
        makeAnalysis("S1", [
          { title: "Design API", estimationPercent: 20, activity: "Design" },
          { title: "Implement logic", estimationPercent: 50 },
          { title: "Write tests", estimationPercent: 30, activity: "Testing" },
        ]),
        makeAnalysis("S2", [
          { title: "Design API", estimationPercent: 25, activity: "Design" },
          { title: "Implement logic", estimationPercent: 45 },
          { title: "Write tests", estimationPercent: 30, activity: "Testing" },
        ]),
      ];

      const result = detector.detect(analyses);
      expect(result.commonTasks.length).toBeGreaterThanOrEqual(3);

      const designTask = result.commonTasks.find(
        (t) => t.canonicalTitle === "Design API",
      );
      expect(designTask).toBeDefined();
      expect(designTask?.frequency).toBe(2);
      expect(designTask?.frequencyRatio).toBe(1);
    });

    test("should calculate correct frequency ratios", () => {
      const analyses = [
        makeAnalysis("S1", [
          { title: "Design", estimationPercent: 30 },
          { title: "Code", estimationPercent: 70 },
        ]),
        makeAnalysis("S2", [
          { title: "Design", estimationPercent: 40 },
          { title: "Code", estimationPercent: 40 },
          { title: "Deploy", estimationPercent: 20 },
        ]),
        makeAnalysis("S3", [
          { title: "Code", estimationPercent: 80 },
          { title: "Deploy", estimationPercent: 20 },
        ]),
      ];

      const result = detector.detect(analyses);

      const codeTask = result.commonTasks.find(
        (t) => t.canonicalTitle === "Code",
      );
      expect(codeTask).toBeDefined();
      expect(codeTask?.frequencyRatio).toBe(1); // appears in all 3

      const designTask = result.commonTasks.find(
        (t) => t.canonicalTitle === "Design",
      );
      expect(designTask).toBeDefined();
      expect(designTask?.frequencyRatio).toBeCloseTo(2 / 3);
    });

    test("should compute activity distribution", () => {
      const analyses = [
        makeAnalysis("S1", [
          { title: "Design API", estimationPercent: 30, activity: "Design" },
          { title: "Build it", estimationPercent: 40, activity: "Development" },
          { title: "Test it", estimationPercent: 30, activity: "Testing" },
        ]),
      ];

      const result = detector.detect(analyses);
      expect(result.activityDistribution.Design).toBeCloseTo(33.33, 0);
      expect(result.activityDistribution.Development).toBeCloseTo(33.33, 0);
      expect(result.activityDistribution.Testing).toBeCloseTo(33.33, 0);
    });

    test("should handle single analysis gracefully", () => {
      const analyses = [
        makeAnalysis("S1", [
          { title: "Design the user interface", estimationPercent: 50 },
          { title: "Write integration tests", estimationPercent: 50 },
        ]),
      ];

      const result = detector.detect(analyses);
      expect(result.commonTasks).toHaveLength(2);
      expect(result.averageTaskCount).toBe(2);
      expect(result.taskCountStdDev).toBe(0);
    });

    test("should handle analyses with no task overlap", () => {
      const analyses = [
        makeAnalysis("S1", [{ title: "Alpha", estimationPercent: 100 }]),
        makeAnalysis("S2", [{ title: "Bravo", estimationPercent: 100 }]),
      ];

      const result = detector.detect(analyses);
      expect(result.commonTasks).toHaveLength(2);
      // Each task appears in only 1 of 2 stories
      const [task0, task1] = result.commonTasks;
      expect(task0?.frequencyRatio).toBe(0.5);
      expect(task1?.frequencyRatio).toBe(0.5);
    });

    test("should detect consistent estimation pattern", () => {
      // Both stories use fibonacci-like task estimations (3, 5)
      const analyses: StoryAnalysis[] = [
        {
          story: makeStory("S1", 8),
          tasks: [
            {
              id: "t1",
              title: "A",
              type: "Task",
              state: "Active",
              estimation: 3,
            },
            {
              id: "t2",
              title: "B",
              type: "Task",
              state: "Active",
              estimation: 5,
            },
          ],
          template: makeTemplate("S1", [
            { title: "A", estimationPercent: 38 },
            { title: "B", estimationPercent: 62 },
          ]),
          warnings: [],
        },
        {
          story: makeStory("S2", 8),
          tasks: [
            {
              id: "t3",
              title: "A",
              type: "Task",
              state: "Active",
              estimation: 3,
            },
            {
              id: "t4",
              title: "B",
              type: "Task",
              state: "Active",
              estimation: 5,
            },
          ],
          template: makeTemplate("S2", [
            { title: "A", estimationPercent: 38 },
            { title: "B", estimationPercent: 62 },
          ]),
          warnings: [],
        },
      ];

      const result = detector.detect(analyses);
      expect(result.estimationPattern.averageTotalEstimation).toBeGreaterThan(0);
    });

    test("should calculate average task count and std dev", () => {
      const analyses = [
        makeAnalysis("S1", [
          { title: "A", estimationPercent: 50 },
          { title: "B", estimationPercent: 50 },
        ]),
        makeAnalysis("S2", [
          { title: "A", estimationPercent: 25 },
          { title: "B", estimationPercent: 25 },
          { title: "C", estimationPercent: 25 },
          { title: "D", estimationPercent: 25 },
        ]),
      ];

      const result = detector.detect(analyses);
      expect(result.averageTaskCount).toBe(3);
      expect(result.taskCountStdDev).toBe(1);
    });
  });

  describe("calculateSimilarity", () => {
    test("should return 1.0 for identical titles", () => {
      expect(detector.calculateSimilarity("Design API", "Design API")).toBe(1);
    });

    test("should return 0.0 for completely different titles", () => {
      expect(detector.calculateSimilarity("alpha", "bravo")).toBe(0);
    });

    test("should return intermediate value for partially similar titles", () => {
      const sim = detector.calculateSimilarity(
        "Implement auth API",
        "Implement auth endpoint",
      );
      expect(sim).toBeGreaterThan(0);
      expect(sim).toBeLessThan(1);
    });

    test("should be case-insensitive", () => {
      expect(detector.calculateSimilarity("Design API", "design api")).toBe(1);
    });
  });

  describe("normalizeTitle", () => {
    test("should strip template variables", () => {
      // biome-ignore-start lint/suspicious/noTemplateCurlyInString: testing template variable stripping
      const result = detector.normalizeTitle(
        "Implement ${story.title} backend",
      );
      expect(result).not.toContain("${story.title}");
      // biome-ignore-end lint/suspicious/noTemplateCurlyInString: testing template variable stripping
    });

    test("should strip common prefixes", () => {
      const result = detector.normalizeTitle("Task: Something important");
      expect(result).toBe("something important");
    });
  });

  describe("bigramDice", () => {
    test("should return 1.0 for identical strings", () => {
      expect(detector.bigramDice("hello", "hello")).toBe(1);
    });

    test("should return 0.0 for completely different strings", () => {
      expect(detector.bigramDice("abc", "xyz")).toBe(0);
    });

    test("should handle partial matches", () => {
      // "setup" and "set-up" share some bigrams
      const sim = detector.bigramDice("setup", "set-up");
      expect(sim).toBeGreaterThan(0);
      expect(sim).toBeLessThan(1);
    });

    test("should be case-insensitive", () => {
      expect(detector.bigramDice("Hello", "hello")).toBe(1);
    });

    test("should handle empty strings", () => {
      expect(detector.bigramDice("", "")).toBe(1);
      expect(detector.bigramDice("abc", "")).toBe(0);
    });
  });

  describe("wordJaccard", () => {
    test("should return 1.0 for identical word sets", () => {
      expect(detector.wordJaccard("design api", "design api")).toBe(1);
    });

    test("should return 0.0 for no word overlap", () => {
      expect(detector.wordJaccard("alpha beta", "gamma delta")).toBe(0);
    });

    test("should handle partial word overlap", () => {
      const sim = detector.wordJaccard("design api endpoint", "design api");
      expect(sim).toBeGreaterThan(0);
      expect(sim).toBeLessThan(1);
    });
  });

  describe("clusterItems", () => {
    const sim = (a: string, b: string) => detector.calculateSimilarity(a, b);

    test("should return empty array for empty input", () => {
      const result = detector.clusterItems([], sim, 0.5);
      expect(result).toHaveLength(0);
    });

    test("should return single cluster for one item", () => {
      const result = detector.clusterItems(["hello"], sim, 0.5);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(["hello"]);
    });

    test("should cluster similar items together", () => {
      const items = [
        "design api endpoint",
        "design api interface",
        "write unit tests",
        "write integration tests",
      ];
      const result = detector.clusterItems(items, sim, 0.5);
      // Should create 2 clusters: design-related and test-related
      expect(result).toHaveLength(2);
    });

    test("should keep dissimilar items in separate clusters", () => {
      const items = ["alpha", "bravo", "charlie"];
      const result = detector.clusterItems(items, sim, 0.5);
      // Each item should be in its own cluster
      expect(result).toHaveLength(3);
    });

    test("should be order-independent", () => {
      const items1 = ["design api", "design interface", "test unit"];
      const items2 = ["test unit", "design interface", "design api"];

      const result1 = detector.clusterItems(items1, sim, 0.5);
      const result2 = detector.clusterItems(items2, sim, 0.5);

      // Same number of clusters regardless of order
      expect(result1.length).toBe(result2.length);
    });
  });
});
