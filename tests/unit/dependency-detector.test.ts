import { describe, expect, test } from "bun:test";
import type { WorkItem } from "@platforms/interfaces/work-item.interface";
import { DependencyDetector } from "@services/template/dependency-detector";
import type {
  CommonTaskPattern,
  DependencyPattern,
  MergedTask,
  StoryAnalysis,
} from "@services/template/story-learner.types";
import type { TaskTemplate } from "@templates/schema";

function makeCommonTask(
  canonicalTitle: string,
  overrides: Partial<CommonTaskPattern> = {},
): CommonTaskPattern {
  return {
    canonicalTitle,
    titleVariants: [canonicalTitle],
    frequency: 3,
    frequencyRatio: 1,
    averageEstimationPercent: 30,
    estimationStdDev: 2,
    activity: "Development",
    ...overrides,
  };
}

function makeTemplate(
  storyId: string,
  tasks: Array<{
    title: string;
    estimationPercent: number;
    activity?: string;
  }>,
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
  tasks: Array<{
    id?: string;
    title: string;
    estimationPercent: number;
    activity?: string;
    predecessorIds?: string[];
    successorIds?: string[];
  }>,
  storyEstimation = 20,
): StoryAnalysis {
  const story: WorkItem = {
    id: storyId,
    title: `Story ${storyId}`,
    type: "User Story",
    state: "Active",
    estimation: storyEstimation,
  };

  const workItems: WorkItem[] = tasks.map((t, i) => ({
    id: t.id ?? `${storyId}-task-${i}`,
    title: t.title,
    type: "Task" as const,
    state: "Active",
    estimation: (t.estimationPercent / 100) * storyEstimation,
    predecessorIds: t.predecessorIds,
    successorIds: t.successorIds,
  }));

  return {
    story,
    tasks: workItems,
    template: makeTemplate(
      storyId,
      tasks.map((t) => ({
        title: t.title,
        estimationPercent: t.estimationPercent,
        activity: t.activity,
      })),
    ),
    warnings: [],
  };
}

function makeMergedTask(
  id: string,
  title: string,
  sources: Array<{ storyId: string; taskTitle: string }> = [],
): MergedTask {
  return {
    task: {
      id,
      title,
      estimationPercent: 30,
      activity: "Development",
    },
    sources,
    similarity: 1,
  };
}

function makePattern(
  dependent: string,
  predecessor: string,
  overrides: Partial<DependencyPattern> = {},
): DependencyPattern {
  return {
    dependentTaskTitle: dependent,
    predecessorTaskTitle: predecessor,
    frequency: 3,
    frequencyRatio: 1,
    confidence: 0.9,
    source: "explicit",
    ...overrides,
  };
}

describe("DependencyDetector", () => {
  const detector = new DependencyDetector();
  describe("detect", () => {
    test("should return empty array when analyses is empty", () => {
      const commonTasks = [makeCommonTask("Design API")];
      const result = detector.detect([], commonTasks);
      expect(result).toEqual([]);
    });

    test("should return empty array when commonTasks is empty", () => {
      const analyses = [
        makeAnalysis("S1", [
          { title: "Design API", estimationPercent: 50 },
          { title: "Write tests", estimationPercent: 50 },
        ]),
      ];
      const result = detector.detect(analyses, []);
      expect(result).toEqual([]);
    });

    test("should return empty array when both inputs are empty", () => {
      const result = detector.detect([], []);
      expect(result).toEqual([]);
    });

    test("should detect explicit dependencies from predecessorIds", () => {
      const analyses = [
        makeAnalysis("S1", [
          { id: "T1", title: "Design API", estimationPercent: 30 },
          {
            id: "T2",
            title: "Write tests",
            estimationPercent: 30,
            predecessorIds: ["T1"],
          },
          {
            id: "T3",
            title: "Code review",
            estimationPercent: 40,
            predecessorIds: ["T2"],
          },
        ]),
        makeAnalysis("S2", [
          { id: "T4", title: "Design API", estimationPercent: 30 },
          {
            id: "T5",
            title: "Write tests",
            estimationPercent: 30,
            predecessorIds: ["T4"],
          },
          {
            id: "T6",
            title: "Code review",
            estimationPercent: 40,
            predecessorIds: ["T5"],
          },
        ]),
        makeAnalysis("S3", [
          { id: "T7", title: "Design API", estimationPercent: 30 },
          {
            id: "T8",
            title: "Write tests",
            estimationPercent: 30,
            predecessorIds: ["T7"],
          },
          {
            id: "T9",
            title: "Code review",
            estimationPercent: 40,
            predecessorIds: ["T8"],
          },
        ]),
      ];

      const commonTasks = [
        makeCommonTask("Design API"),
        makeCommonTask("Write tests"),
        makeCommonTask("Code review"),
      ];

      const result = detector.detect(analyses, commonTasks);

      const writeTestsDep = result.find(
        (p) =>
          p.dependentTaskTitle === "Write tests" &&
          p.predecessorTaskTitle === "Design API",
      );
      expect(writeTestsDep).toBeDefined();
      expect(writeTestsDep?.source).toBe("explicit");
      expect(writeTestsDep?.frequency).toBe(3);

      const codeReviewDep = result.find(
        (p) =>
          p.dependentTaskTitle === "Code review" &&
          p.predecessorTaskTitle === "Write tests",
      );
      expect(codeReviewDep).toBeDefined();
      expect(codeReviewDep?.source).toBe("explicit");
    });

    test("should not create self-dependencies from explicit links", () => {
      const analyses = [
        makeAnalysis("S1", [
          { id: "T1", title: "Design API", estimationPercent: 50 },
          {
            id: "T2",
            title: "Design API",
            estimationPercent: 50,
            predecessorIds: ["T1"],
          },
        ]),
      ];

      const commonTasks = [makeCommonTask("Design API")];
      const result = detector.detect(analyses, commonTasks);

      const selfDep = result.find(
        (p) =>
          p.dependentTaskTitle === "Design API" &&
          p.predecessorTaskTitle === "Design API",
      );
      expect(selfDep).toBeUndefined();
    });

    test("should NOT detect dependencies without explicit predecessor links", () => {
      // 3 stories, each with Design -> Implement -> Test in same order
      const analyses = [
        makeAnalysis("S1", [
          { title: "Design API", estimationPercent: 20 },
          { title: "Implement logic", estimationPercent: 50 },
          { title: "Write tests", estimationPercent: 30 },
        ]),
        makeAnalysis("S2", [
          { title: "Design API", estimationPercent: 25 },
          { title: "Implement logic", estimationPercent: 45 },
          { title: "Write tests", estimationPercent: 30 },
        ]),
        makeAnalysis("S3", [
          { title: "Design API", estimationPercent: 20 },
          { title: "Implement logic", estimationPercent: 50 },
          { title: "Write tests", estimationPercent: 30 },
        ]),
      ];

      const commonTasks = [
        makeCommonTask("Design API"),
        makeCommonTask("Implement logic"),
        makeCommonTask("Write tests"),
      ];

      const result = detector.detect(analyses, commonTasks);
      expect(result.length).toBe(0);
    });

    test("should sort results by confidence descending", () => {
      const analyses = [
        makeAnalysis("S1", [
          { id: "T1", title: "Design API", estimationPercent: 20 },
          {
            id: "T2",
            title: "Write tests",
            estimationPercent: 30,
            predecessorIds: ["T1"],
          },
          { title: "Code review", estimationPercent: 50 },
        ]),
        makeAnalysis("S2", [
          { id: "T3", title: "Design API", estimationPercent: 20 },
          {
            id: "T4",
            title: "Write tests",
            estimationPercent: 30,
            predecessorIds: ["T3"],
          },
          { title: "Code review", estimationPercent: 50 },
        ]),
        makeAnalysis("S3", [
          { id: "T5", title: "Design API", estimationPercent: 20 },
          {
            id: "T6",
            title: "Write tests",
            estimationPercent: 30,
            predecessorIds: ["T5"],
          },
          { title: "Code review", estimationPercent: 50 },
        ]),
      ];

      const commonTasks = [
        makeCommonTask("Design API"),
        makeCommonTask("Write tests"),
        makeCommonTask("Code review"),
      ];

      const result = detector.detect(analyses, commonTasks);

      for (let i = 1; i < result.length; i++) {
        const prev = result[i - 1];
        const curr = result[i];
        expect(prev).toBeDefined();
        expect(curr).toBeDefined();
        if (prev && curr) {
          expect(prev.confidence).toBeGreaterThanOrEqual(curr.confidence);
        }
      }
    });

    test("should ignore tasks not matching any common task", () => {
      const analyses = [
        makeAnalysis("S1", [
          { id: "T1", title: "Design API", estimationPercent: 50 },
          {
            id: "T2",
            title: "Obscure unrelated task XYZ",
            estimationPercent: 50,
            predecessorIds: ["T1"],
          },
        ]),
      ];

      // Only Design API is in common tasks
      const commonTasks = [makeCommonTask("Design API")];

      const result = detector.detect(analyses, commonTasks);

      const dep = result.find(
        (p) => p.dependentTaskTitle === "Obscure unrelated task XYZ",
      );
      expect(dep).toBeUndefined();
    });

  });

  // -----------------------------------------------------------------------
  // augmentCommonTasks()
  // -----------------------------------------------------------------------
  describe("augmentCommonTasks", () => {
    test("should add dependsOn and dependents to common tasks", () => {
      const commonTasks = [
        makeCommonTask("Design API"),
        makeCommonTask("Write tests"),
        makeCommonTask("Code review"),
      ];

      const patterns: DependencyPattern[] = [
        makePattern("Write tests", "Design API"),
        makePattern("Code review", "Write tests"),
      ];

      const result = detector.augmentCommonTasks(commonTasks, patterns);

      const designApi = result.find((t) => t.canonicalTitle === "Design API");
      expect(designApi?.dependsOn).toBeUndefined();
      expect(designApi?.dependents).toContain("Write tests");

      const writeTests = result.find((t) => t.canonicalTitle === "Write tests");
      expect(writeTests?.dependsOn).toContain("Design API");
      expect(writeTests?.dependents).toContain("Code review");

      const codeReview = result.find((t) => t.canonicalTitle === "Code review");
      expect(codeReview?.dependsOn).toContain("Write tests");
      expect(codeReview?.dependents).toBeUndefined();
    });

    test("should return unchanged tasks when patterns is empty", () => {
      const commonTasks = [
        makeCommonTask("Design API"),
        makeCommonTask("Write tests"),
      ];

      const result = detector.augmentCommonTasks(commonTasks, []);

      for (const task of result) {
        expect(task.dependsOn).toBeUndefined();
        expect(task.dependents).toBeUndefined();
      }
    });

    test("should handle multiple predecessors for a single task", () => {
      const commonTasks = [
        makeCommonTask("Design API"),
        makeCommonTask("Implement logic"),
        makeCommonTask("Code review"),
      ];

      const patterns: DependencyPattern[] = [
        makePattern("Code review", "Design API"),
        makePattern("Code review", "Implement logic"),
      ];

      const result = detector.augmentCommonTasks(commonTasks, patterns);

      const codeReview = result.find((t) => t.canonicalTitle === "Code review");
      expect(codeReview?.dependsOn).toHaveLength(2);
      expect(codeReview?.dependsOn).toContain("Design API");
      expect(codeReview?.dependsOn).toContain("Implement logic");
    });

    test("should not duplicate dependencies", () => {
      const commonTasks = [
        makeCommonTask("Design API"),
        makeCommonTask("Write tests"),
      ];

      // Same dependency listed twice
      const patterns: DependencyPattern[] = [
        makePattern("Write tests", "Design API"),
        makePattern("Write tests", "Design API"),
      ];

      const result = detector.augmentCommonTasks(commonTasks, patterns);

      const writeTests = result.find((t) => t.canonicalTitle === "Write tests");
      expect(writeTests?.dependsOn).toHaveLength(1);
    });

    test("should handle tasks not in commonTasks gracefully", () => {
      const commonTasks = [makeCommonTask("Design API")];

      // Pattern references a task not in commonTasks
      const patterns: DependencyPattern[] = [
        makePattern("Unknown task", "Design API"),
      ];

      const result = detector.augmentCommonTasks(commonTasks, patterns);

      // Design API should still get its dependent listed
      const designApi = result.find((t) => t.canonicalTitle === "Design API");
      expect(designApi?.dependents).toContain("Unknown task");

      // No task for "Unknown task" in the result since it's not in commonTasks
      expect(result).toHaveLength(1);
    });
  });

  // -----------------------------------------------------------------------
  // generateDependsOn()
  // -----------------------------------------------------------------------
  describe("generateDependsOn", () => {
    test("should convert dependency patterns to task IDs", () => {
      const mergedTasks: MergedTask[] = [
        makeMergedTask("design-1", "Design API", [
          { storyId: "S1", taskTitle: "Design API" },
        ]),
        makeMergedTask("test-1", "Write tests", [
          { storyId: "S1", taskTitle: "Write tests" },
        ]),
      ];

      const patterns: DependencyPattern[] = [
        makePattern("Write tests", "Design API", { confidence: 0.9 }),
      ];

      const result = detector.generateDependsOn(mergedTasks, patterns, 0.7);

      const writeTests = result.find((mt) => mt.task.id === "test-1");
      expect(writeTests?.learnedDependsOn).toBeDefined();
      expect(writeTests?.learnedDependsOn).toContain("design-1");
    });

    test("should filter out patterns below confidence threshold", () => {
      const mergedTasks: MergedTask[] = [
        makeMergedTask("design-1", "Design API"),
        makeMergedTask("test-1", "Write tests"),
      ];

      const patterns: DependencyPattern[] = [
        makePattern("Write tests", "Design API", { confidence: 0.5 }),
      ];

      const result = detector.generateDependsOn(mergedTasks, patterns, 0.7);

      const writeTests = result.find((mt) => mt.task.id === "test-1");
      expect(writeTests?.learnedDependsOn).toBeUndefined();
    });

    test("should use default confidence threshold of 0.7", () => {
      const mergedTasks: MergedTask[] = [
        makeMergedTask("design-1", "Design API"),
        makeMergedTask("test-1", "Write tests"),
      ];

      const highConfPattern = makePattern("Write tests", "Design API", {
        confidence: 0.8,
      });

      const result = detector.generateDependsOn(mergedTasks, [highConfPattern]);

      const writeTests = result.find((mt) => mt.task.id === "test-1");
      expect(writeTests?.learnedDependsOn).toBeDefined();
      expect(writeTests?.learnedDependsOn).toContain("design-1");
    });

    test("should not add learnedDependsOn when no patterns match", () => {
      const mergedTasks: MergedTask[] = [
        makeMergedTask("design-1", "Design API"),
        makeMergedTask("test-1", "Write tests"),
      ];

      const result = detector.generateDependsOn(mergedTasks, [], 0.7);

      for (const mt of result) {
        expect(mt.learnedDependsOn).toBeUndefined();
      }
    });

    test("should handle multiple dependencies for one task", () => {
      const mergedTasks: MergedTask[] = [
        makeMergedTask("design-1", "Design API"),
        makeMergedTask("impl-1", "Implement logic"),
        makeMergedTask("review-1", "Code review"),
      ];

      const patterns: DependencyPattern[] = [
        makePattern("Code review", "Design API", { confidence: 0.9 }),
        makePattern("Code review", "Implement logic", { confidence: 0.8 }),
      ];

      const result = detector.generateDependsOn(mergedTasks, patterns, 0.7);

      const codeReview = result.find((mt) => mt.task.id === "review-1");
      expect(codeReview?.learnedDependsOn).toBeDefined();
      expect(codeReview?.learnedDependsOn).toHaveLength(2);
      expect(codeReview?.learnedDependsOn).toContain("design-1");
      expect(codeReview?.learnedDependsOn).toContain("impl-1");
    });

    test("should not duplicate IDs in learnedDependsOn", () => {
      const mergedTasks: MergedTask[] = [
        makeMergedTask("design-1", "Design API"),
        makeMergedTask("test-1", "Write tests"),
      ];

      // Same dependency pattern duplicated
      const patterns: DependencyPattern[] = [
        makePattern("Write tests", "Design API", { confidence: 0.9 }),
        makePattern("Write tests", "Design API", { confidence: 0.85 }),
      ];

      const result = detector.generateDependsOn(mergedTasks, patterns, 0.7);

      const writeTests = result.find((mt) => mt.task.id === "test-1");
      expect(writeTests?.learnedDependsOn).toHaveLength(1);
    });

    test("should leave tasks without matching predecessor IDs unchanged", () => {
      const mergedTasks: MergedTask[] = [
        makeMergedTask("test-1", "Write tests"),
      ];

      // Predecessor "Design API" doesn't exist in merged tasks
      const patterns: DependencyPattern[] = [
        makePattern("Write tests", "Design API", { confidence: 0.9 }),
      ];

      const result = detector.generateDependsOn(mergedTasks, patterns, 0.7);

      const writeTests = result.find((mt) => mt.task.id === "test-1");
      expect(writeTests?.learnedDependsOn).toBeUndefined();
    });

    test("should handle tasks without IDs gracefully", () => {
      const noIdTask: MergedTask = {
        task: {
          title: "Design API",
          estimationPercent: 30,
          activity: "Development",
        },
        sources: [],
        similarity: 1,
      };

      const mergedTasks: MergedTask[] = [
        noIdTask,
        makeMergedTask("test-1", "Write tests"),
      ];

      const patterns: DependencyPattern[] = [
        makePattern("Write tests", "Design API", { confidence: 0.9 }),
      ];

      const result = detector.generateDependsOn(mergedTasks, patterns, 0.7);

      // "Design API" has no id, so it can't be a predecessor
      const writeTests = result.find((mt) => mt.task.id === "test-1");
      expect(writeTests?.learnedDependsOn).toBeUndefined();
    });
  });

  // -----------------------------------------------------------------------
  // calculateAveragePositions()
  // -----------------------------------------------------------------------
  describe("calculateAveragePositions", () => {
    test("should return empty map for empty analyses", () => {
      const commonTasks = [makeCommonTask("Design API")];
      const result = detector.calculateAveragePositions([], commonTasks);
      expect(result.size).toBe(0);
    });

    test("should return empty map for empty common tasks", () => {
      const analyses = [
        makeAnalysis("S1", [{ title: "Design API", estimationPercent: 100 }]),
      ];
      const result = detector.calculateAveragePositions(analyses, []);
      expect(result.size).toBe(0);
    });

    test("should calculate normalized positions for a single story", () => {
      const analyses = [
        makeAnalysis("S1", [
          { title: "Design API", estimationPercent: 30 },
          { title: "Implement logic", estimationPercent: 40 },
          { title: "Write tests", estimationPercent: 30 },
        ]),
      ];

      const commonTasks = [
        makeCommonTask("Design API"),
        makeCommonTask("Implement logic"),
        makeCommonTask("Write tests"),
      ];

      const result = detector.calculateAveragePositions(analyses, commonTasks);

      // Positions: 0/3 = 0.0, 1/3 = 0.33, 2/3 = 0.67
      expect(result.get("Design API")).toBe(0);
      expect(result.get("Implement logic")).toBe(0.33);
      expect(result.get("Write tests")).toBe(0.67);
    });

    test("should average positions across multiple stories", () => {
      const analyses = [
        makeAnalysis("S1", [
          { title: "Design API", estimationPercent: 50 },
          { title: "Write tests", estimationPercent: 50 },
        ]),
        makeAnalysis("S2", [
          { title: "Design API", estimationPercent: 50 },
          { title: "Write tests", estimationPercent: 50 },
        ]),
      ];

      const commonTasks = [
        makeCommonTask("Design API"),
        makeCommonTask("Write tests"),
      ];

      const result = detector.calculateAveragePositions(analyses, commonTasks);

      // S1: Design = 0/2 = 0, Tests = 1/2 = 0.5
      // S2: Design = 0/2 = 0, Tests = 1/2 = 0.5
      // Average: Design = 0, Tests = 0.5
      expect(result.get("Design API")).toBe(0);
      expect(result.get("Write tests")).toBe(0.5);
    });

    test("should handle varying task counts across stories", () => {
      const analyses = [
        makeAnalysis("S1", [
          { title: "Design API", estimationPercent: 30 },
          { title: "Implement logic", estimationPercent: 40 },
          { title: "Write tests", estimationPercent: 30 },
        ]),
        makeAnalysis("S2", [
          { title: "Design API", estimationPercent: 50 },
          { title: "Write tests", estimationPercent: 50 },
        ]),
      ];

      const commonTasks = [
        makeCommonTask("Design API"),
        makeCommonTask("Write tests"),
      ];

      const result = detector.calculateAveragePositions(analyses, commonTasks);

      // S1: Design = 0/3 = 0, Tests = 2/3 = 0.667
      // S2: Design = 0/2 = 0, Tests = 1/2 = 0.5
      // Average: Design = 0, Tests = (0.667 + 0.5) / 2 = 0.583 => rounded to 0.58
      expect(result.get("Design API")).toBe(0);
      const testsPosition = result.get("Write tests");
      expect(testsPosition).toBeDefined();
      expect(testsPosition).toBeGreaterThan(0.5);
      expect(testsPosition).toBeLessThan(0.7);
    });

    test("should skip stories with zero tasks in the template", () => {
      const emptyAnalysis: StoryAnalysis = {
        story: {
          id: "S-EMPTY",
          title: "Empty",
          type: "User Story",
          state: "Active",
        },
        tasks: [],
        template: {
          version: "1.0",
          name: "Empty template",
          description: "",
          filter: { workItemTypes: ["User Story"] },
          tasks: [],
          estimation: { strategy: "percentage", rounding: "none" },
        },
        warnings: [],
      };

      const analyses = [
        emptyAnalysis,
        makeAnalysis("S1", [
          { title: "Design API", estimationPercent: 50 },
          { title: "Write tests", estimationPercent: 50 },
        ]),
      ];

      const commonTasks = [
        makeCommonTask("Design API"),
        makeCommonTask("Write tests"),
      ];

      const result = detector.calculateAveragePositions(analyses, commonTasks);

      // Only S1 contributes; S-EMPTY is skipped
      expect(result.get("Design API")).toBe(0);
      expect(result.get("Write tests")).toBe(0.5);
    });

    test("should round positions to two decimal places", () => {
      const analyses = [
        makeAnalysis("S1", [
          { title: "A", estimationPercent: 25 },
          { title: "B", estimationPercent: 25 },
          { title: "C", estimationPercent: 25 },
          { title: "D", estimationPercent: 25 },
        ]),
      ];

      const commonTasks = [
        makeCommonTask("A"),
        makeCommonTask("B"),
        makeCommonTask("C"),
        makeCommonTask("D"),
      ];

      const result = detector.calculateAveragePositions(analyses, commonTasks);

      // Position: 0/4=0, 1/4=0.25, 2/4=0.5, 3/4=0.75
      expect(result.get("A")).toBe(0);
      expect(result.get("B")).toBe(0.25);
      expect(result.get("C")).toBe(0.5);
      expect(result.get("D")).toBe(0.75);
    });

    test("should only include tasks matching common tasks", () => {
      const analyses = [
        makeAnalysis("S1", [
          { title: "Design API", estimationPercent: 30 },
          { title: "Random unique task", estimationPercent: 40 },
          { title: "Write tests", estimationPercent: 30 },
        ]),
      ];

      // Only Design API is in common tasks
      const commonTasks = [makeCommonTask("Design API")];

      const result = detector.calculateAveragePositions(analyses, commonTasks);

      expect(result.has("Design API")).toBe(true);
      expect(result.has("Random unique task")).toBe(false);
      expect(result.has("Write tests")).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // matchToCommonTask()
  // -----------------------------------------------------------------------
  describe("matchToCommonTask", () => {
    test("should match exact title variant", () => {
      const commonTasks = [
        makeCommonTask("Design API", {
          titleVariants: ["Design API", "API Design"],
        }),
      ];

      const match = detector.matchToCommonTask("API Design", commonTasks);
      expect(match).toBeDefined();
      expect(match?.canonicalTitle).toBe("Design API");
    });

    test("should return undefined when no match found", () => {
      const commonTasks = [makeCommonTask("Design API")];
      const match = detector.matchToCommonTask(
        "Completely different task with no overlap",
        commonTasks,
      );
      expect(match).toBeUndefined();
    });

    test("should fall back to similarity matching", () => {
      const commonTasks = [makeCommonTask("Write unit tests")];

      // "Write tests" is similar enough to "Write unit tests"
      const match = detector.matchToCommonTask(
        "Write unit tests for API",
        commonTasks,
      );
      expect(match).toBeDefined();
      expect(match?.canonicalTitle).toBe("Write unit tests");
    });

    test("should return best match when multiple common tasks are similar", () => {
      const commonTasks = [
        makeCommonTask("Design API endpoints"),
        makeCommonTask("Design database schema"),
      ];

      const match = detector.matchToCommonTask(
        "Design API endpoints",
        commonTasks,
      );
      expect(match).toBeDefined();
      expect(match?.canonicalTitle).toBe("Design API endpoints");
    });
  });

  // -----------------------------------------------------------------------
  // Edge cases / integration
  // -----------------------------------------------------------------------
  describe("edge cases", () => {
    test("should handle single-story analysis without errors", () => {
      const analyses = [
        makeAnalysis("S1", [
          { id: "T1", title: "Design API", estimationPercent: 30 },
          {
            id: "T2",
            title: "Write tests",
            estimationPercent: 70,
            predecessorIds: ["T1"],
          },
        ]),
      ];

      const commonTasks = [
        makeCommonTask("Design API"),
        makeCommonTask("Write tests"),
      ];

      // Single story: explicit dep frequency = 1, frequencyRatio = 1/1 = 1.0
      // Passes the >= 0.3 threshold for explicit
      const result = detector.detect(analyses, commonTasks);
      expect(Array.isArray(result)).toBe(true);
    });


    test("should handle explicit dependency with low frequency ratio", () => {
      // Explicit dep appears in only 1 out of 10 stories -> frequencyRatio = 0.1 < 0.3
      const analyses: StoryAnalysis[] = [];
      for (let i = 0; i < 10; i++) {
        if (i === 0) {
          analyses.push(
            makeAnalysis(`S${i}`, [
              { id: `T${i}-1`, title: "Design API", estimationPercent: 50 },
              {
                id: `T${i}-2`,
                title: "Write tests",
                estimationPercent: 50,
                predecessorIds: [`T${i}-1`],
              },
            ]),
          );
        } else {
          analyses.push(
            makeAnalysis(`S${i}`, [
              { id: `T${i}-1`, title: "Design API", estimationPercent: 50 },
              { id: `T${i}-2`, title: "Write tests", estimationPercent: 50 },
            ]),
          );
        }
      }

      const commonTasks = [
        makeCommonTask("Design API"),
        makeCommonTask("Write tests"),
      ];

      const result = detector.detect(analyses, commonTasks);

      // Explicit dep: frequency = 1, frequencyRatio = 1/10 = 0.1 < 0.3
      // Should be filtered out
      const explicitDep = result.find(
        (p) =>
          p.source === "explicit" &&
          p.dependentTaskTitle === "Write tests" &&
          p.predecessorTaskTitle === "Design API",
      );
      expect(explicitDep).toBeUndefined();
    });

    test("full roundtrip: detect, augment, and generate", () => {
      const analyses = [
        makeAnalysis("S1", [
          { id: "T1", title: "Design API", estimationPercent: 30 },
          {
            id: "T2",
            title: "Write tests",
            estimationPercent: 30,
            predecessorIds: ["T1"],
          },
          {
            id: "T3",
            title: "Code review",
            estimationPercent: 40,
            predecessorIds: ["T2"],
          },
        ]),
        makeAnalysis("S2", [
          { id: "T4", title: "Design API", estimationPercent: 30 },
          {
            id: "T5",
            title: "Write tests",
            estimationPercent: 30,
            predecessorIds: ["T4"],
          },
          {
            id: "T6",
            title: "Code review",
            estimationPercent: 40,
            predecessorIds: ["T5"],
          },
        ]),
        makeAnalysis("S3", [
          { id: "T7", title: "Design API", estimationPercent: 30 },
          {
            id: "T8",
            title: "Write tests",
            estimationPercent: 30,
            predecessorIds: ["T7"],
          },
          {
            id: "T9",
            title: "Code review",
            estimationPercent: 40,
            predecessorIds: ["T8"],
          },
        ]),
      ];

      const commonTasks = [
        makeCommonTask("Design API"),
        makeCommonTask("Write tests"),
        makeCommonTask("Code review"),
      ];

      // Step 1: detect
      const patterns = detector.detect(analyses, commonTasks);
      expect(patterns.length).toBeGreaterThan(0);

      // Step 2: augment
      const augmented = detector.augmentCommonTasks(commonTasks, patterns);
      const designAugmented = augmented.find(
        (t) => t.canonicalTitle === "Design API",
      );
      expect(designAugmented?.dependents).toBeDefined();

      // Step 3: generate
      const mergedTasks: MergedTask[] = [
        makeMergedTask("design-1", "Design API"),
        makeMergedTask("test-1", "Write tests"),
        makeMergedTask("review-1", "Code review"),
      ];

      const withDeps = detector.generateDependsOn(mergedTasks, patterns, 0.5);

      // At least one task should have learnedDependsOn
      const tasksWithDeps = withDeps.filter((mt) => mt.learnedDependsOn);
      expect(tasksWithDeps.length).toBeGreaterThan(0);
    });
  });
});
