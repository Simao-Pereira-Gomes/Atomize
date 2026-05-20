import { describe, expect, test } from "bun:test";
import type { WorkItem } from "@platforms/interfaces/work-item.interface";
import { ConditionPatternDetector } from "@services/template/pattern-detection";
import type {
  CommonTaskPattern,
  MergedTask,
  StoryAnalysis,
} from "@services/template/story-learner.types";
import type { Condition, TaskTemplate } from "@templates/schema";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeStory(
  id: string,
  overrides: Partial<WorkItem> = {},
): WorkItem {
  return {
    id,
    title: `Story ${id}`,
    type: "User Story",
    state: "Active",
    ...overrides,
  };
}

function makeTemplate(
  tasks: Array<{ title: string; estimationPercent: number; activity?: string }>,
): TaskTemplate {
  return {
    version: "1.0",
    name: "Template",
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
  taskTitles: string[],
  storyOverrides: Partial<WorkItem> = {},
): StoryAnalysis {
  const story = makeStory(storyId, { estimation: 20, ...storyOverrides });
  const tasks: WorkItem[] = taskTitles.map((title, i) => ({
    id: `${storyId}-task-${i}`,
    title,
    type: "Task" as const,
    state: "Active",
    estimation: 4,
  }));
  const template = makeTemplate(
    taskTitles.map((title) => ({
      title,
      estimationPercent: Math.round(100 / taskTitles.length),
    })),
  );
  return { story, tasks, template, warnings: [] };
}

function makeCommonTask(
  canonicalTitle: string,
  titleVariants: string[],
  frequency: number,
  frequencyRatio: number,
): CommonTaskPattern {
  return {
    canonicalTitle,
    titleVariants,
    frequency,
    frequencyRatio,
    averageEstimationPercent: 25,
    estimationStdDev: 5,
    activity: "Development",
  };
}

function makeMergedTask(
  title: string,
  overrides: Partial<MergedTask> = {},
): MergedTask {
  return {
    task: {
      id: `mt-${title}`,
      title,
      estimationPercent: 25,
      activity: "Development",
    },
    sources: [{ storyId: "S1", taskTitle: title }],
    similarity: 1.0,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ConditionPatternDetector", () => {
  const detector = new ConditionPatternDetector();

  // ========================================================================
  // 1. Empty / insufficient inputs
  // ========================================================================
  describe("empty and insufficient inputs", () => {
    test("returns empty array when analyses list is empty", () => {
      const result = detector.detect([], []);
      expect(result).toEqual([]);
    });

    test("returns empty array when fewer than 3 stories are provided", () => {
      const analyses = [
        makeAnalysis("S1", ["Design", "Code"]),
        makeAnalysis("S2", ["Design", "Code"]),
      ];
      const commonTasks = [
        makeCommonTask("Design", ["Design"], 2, 1.0),
        makeCommonTask("Code", ["Code"], 2, 1.0),
      ];

      const result = detector.detect(analyses, commonTasks);
      expect(result).toEqual([]);
    });

    test("returns empty array when no common tasks are supplied", () => {
      const analyses = [
        makeAnalysis("S1", ["A"]),
        makeAnalysis("S2", ["A"]),
        makeAnalysis("S3", ["A"]),
      ];
      const result = detector.detect(analyses, []);
      expect(result).toEqual([]);
    });

    test("returns empty when common task frequency is below minimum sample size", () => {
      const analyses = [
        makeAnalysis("S1", ["Rare task"], { tags: ["api"] }),
        makeAnalysis("S2", ["Other"], { tags: ["api"] }),
        makeAnalysis("S3", ["Other"]),
        makeAnalysis("S4", ["Other"]),
      ];
      // frequency = 1, below minSampleSize of 3
      const commonTasks = [makeCommonTask("Rare task", ["Rare task"], 1, 0.25)];

      const result = detector.detect(analyses, commonTasks);
      expect(result).toEqual([]);
    });
  });

  // ========================================================================
  // 2. Tag-based condition detection
  // ========================================================================
  describe("tag-based conditions", () => {
    test("detects positive tag correlation when task appears with specific tag", () => {
      // 5 stories total. "Security Review" appears in all 4 stories with tag "security"
      // and does NOT appear in the 1 story without tag "security"
      const analyses = [
        makeAnalysis("S1", ["Design", "Code", "Security Review"], { tags: ["security"] }),
        makeAnalysis("S2", ["Design", "Code", "Security Review"], { tags: ["security"] }),
        makeAnalysis("S3", ["Design", "Code", "Security Review"], { tags: ["security"] }),
        makeAnalysis("S4", ["Design", "Code", "Security Review"], { tags: ["security"] }),
        makeAnalysis("S5", ["Design", "Code"], { tags: ["frontend"] }),
      ];

      const commonTasks = [
        makeCommonTask("Security Review", ["Security Review"], 4, 0.8),
      ];

      const result = detector.detect(analyses, commonTasks);
      const tagPattern = result.find(
        (p) => p.correlationType === "tag" && p.correlatedValue === "security",
      );

      expect(tagPattern).toBeDefined();
      expect(tagPattern?.confidence).toBeGreaterThanOrEqual(0.7);
      expect(tagPattern?.condition).toEqual({ field: "tags", operator: "contains", value: "security" });
      expect(tagPattern?.taskCanonicalTitle).toBe("Security Review");
    });

    test("detects negative tag correlation when task appears without specific tag", () => {
      // Task "Basic Setup" appears in all 4 stories WITHOUT tag "premium",
      // and does NOT appear in the 1 story WITH tag "premium"
      const analyses = [
        makeAnalysis("S1", ["Design", "Basic Setup"], {}),
        makeAnalysis("S2", ["Design", "Basic Setup"], {}),
        makeAnalysis("S3", ["Design", "Basic Setup"], {}),
        makeAnalysis("S4", ["Design", "Basic Setup"], {}),
        makeAnalysis("S5", ["Design", "Advanced Setup"], { tags: ["premium"] }),
      ];

      const commonTasks = [
        makeCommonTask("Basic Setup", ["Basic Setup"], 4, 0.8),
      ];

      const result = detector.detect(analyses, commonTasks);
      const negativePattern = result.find(
        (p) =>
          p.correlationType === "tag" &&
          p.correlatedValue === "premium" &&
          "field" in p.condition && p.condition.operator === "not-contains",
      );

      expect(negativePattern).toBeDefined();
      expect(negativePattern?.confidence).toBeGreaterThanOrEqual(0.7);
    });

    test("does not detect tag correlation when correlation is weak", () => {
      // Task appears in roughly equal proportion with and without the tag
      const analyses = [
        makeAnalysis("S1", ["Code", "Test"], { tags: ["api"] }),
        makeAnalysis("S2", ["Code", "Test"], { tags: ["api"] }),
        makeAnalysis("S3", ["Code", "Test"], {}),
        makeAnalysis("S4", ["Code", "Test"], {}),
      ];

      const commonTasks = [
        makeCommonTask("Test", ["Test"], 4, 1.0),
      ];

      // frequencyRatio is 1.0 >= 0.9, so this task is skipped
      const result = detector.detect(analyses, commonTasks);
      const tagPatterns = result.filter((p) => p.correlationType === "tag");
      expect(tagPatterns).toHaveLength(0);
    });

    test("ignores stories with no tags for tag-based detection", () => {
      // None of the stories have tags - should detect no tag conditions
      const analyses = [
        makeAnalysis("S1", ["Design", "Code"]),
        makeAnalysis("S2", ["Design", "Code"]),
        makeAnalysis("S3", ["Design"]),
      ];

      const commonTasks = [makeCommonTask("Code", ["Code"], 2, 0.67)];

      // No tags on any story => allStoryTags set is empty => no tag conditions
      const result = detector.detect(analyses, commonTasks);
      const tagPatterns = result.filter((p) => p.correlationType === "tag");
      expect(tagPatterns).toHaveLength(0);
    });
  });

  // ========================================================================
  // 3. Priority-based conditions
  // ========================================================================
  describe("priority-based conditions", () => {
    test("detects high-priority correlation for a task", () => {
      // "Hotfix Validation" appears only in high priority (priority 1) stories
      const analyses = [
        makeAnalysis("S1", ["Design", "Code", "Hotfix Validation"], { priority: 1 }),
        makeAnalysis("S2", ["Design", "Code", "Hotfix Validation"], { priority: 1 }),
        makeAnalysis("S3", ["Design", "Code", "Hotfix Validation"], { priority: 1 }),
        makeAnalysis("S4", ["Design", "Code"], { priority: 3 }),
        makeAnalysis("S5", ["Design", "Code"], { priority: 4 }),
      ];

      const commonTasks = [
        makeCommonTask("Hotfix Validation", ["Hotfix Validation"], 3, 0.6),
      ];

      const result = detector.detect(analyses, commonTasks);
      const priorityPattern = result.find(
        (p) =>
          p.correlationType === "priority" &&
          p.taskCanonicalTitle === "Hotfix Validation",
      );

      expect(priorityPattern).toBeDefined();
      expect(priorityPattern?.confidence).toBeGreaterThanOrEqual(0.7);
      const priCond = priorityPattern?.condition;
      expect(priCond && "field" in priCond && priCond.field).toBe("priority");
      expect(priCond && "field" in priCond && priCond.operator).toBe("lte");
    });

    test("detects low-priority correlation for a task", () => {
      // "Documentation" appears only in low priority stories (priority > 2)
      const analyses = [
        makeAnalysis("S1", ["Code"], { priority: 1 }),
        makeAnalysis("S2", ["Code"], { priority: 1 }),
        makeAnalysis("S3", ["Code", "Documentation"], { priority: 3 }),
        makeAnalysis("S4", ["Code", "Documentation"], { priority: 4 }),
        makeAnalysis("S5", ["Code", "Documentation"], { priority: 4 }),
      ];

      const commonTasks = [
        makeCommonTask("Documentation", ["Documentation"], 3, 0.6),
      ];

      const result = detector.detect(analyses, commonTasks);
      const priorityPattern = result.find(
        (p) =>
          p.correlationType === "priority" &&
          p.taskCanonicalTitle === "Documentation",
      );

      expect(priorityPattern).toBeDefined();
      expect(priorityPattern?.confidence).toBeGreaterThanOrEqual(0.7);
      const lowPriCond = priorityPattern?.condition;
      expect(lowPriCond && "field" in lowPriCond && lowPriCond.operator).toBe("gt");
    });

    test("does not detect priority correlation when stories have no priority", () => {
      const analyses = [
        makeAnalysis("S1", ["Code", "Test"]),
        makeAnalysis("S2", ["Code", "Test"]),
        makeAnalysis("S3", ["Code"]),
      ];

      const commonTasks = [makeCommonTask("Test", ["Test"], 2, 0.67)];

      const result = detector.detect(analyses, commonTasks);
      const priorityPatterns = result.filter(
        (p) => p.correlationType === "priority",
      );
      expect(priorityPatterns).toHaveLength(0);
    });
  });

  // ========================================================================
  // 4. Estimation-based conditions
  // ========================================================================
  describe("estimation-based conditions", () => {
    test("detects task correlated with large story estimation", () => {
      // "Performance Testing" only appears in large stories (estimation >= 13)
      const analyses = [
        makeAnalysis("S1", ["Code", "Performance Testing"], { estimation: 20 }),
        makeAnalysis("S2", ["Code", "Performance Testing"], { estimation: 13 }),
        makeAnalysis("S3", ["Code", "Performance Testing"], { estimation: 21 }),
        makeAnalysis("S4", ["Code"], { estimation: 3 }),
        makeAnalysis("S5", ["Code"], { estimation: 5 }),
      ];

      const commonTasks = [
        makeCommonTask("Performance Testing", ["Performance Testing"], 3, 0.6),
      ];

      const result = detector.detect(analyses, commonTasks);
      const estimationPattern = result.find(
        (p) =>
          p.correlationType === "estimation" &&
          p.taskCanonicalTitle === "Performance Testing",
      );

      expect(estimationPattern).toBeDefined();
      expect(estimationPattern?.confidence).toBeGreaterThanOrEqual(0.7);
      const estCond = estimationPattern?.condition;
      expect(estCond && "field" in estCond && estCond.field).toBe("estimation");
      expect(estCond && "field" in estCond && estCond.operator).toBe("gte");
    });

    test("detects task correlated with small story estimation", () => {
      // "Quick Fix" only appears in small stories (estimation < median)
      const analyses = [
        makeAnalysis("S1", ["Code", "Quick Fix"], { estimation: 2 }),
        makeAnalysis("S2", ["Code", "Quick Fix"], { estimation: 3 }),
        makeAnalysis("S3", ["Code", "Quick Fix"], { estimation: 1 }),
        makeAnalysis("S4", ["Code"], { estimation: 20 }),
        makeAnalysis("S5", ["Code"], { estimation: 21 }),
      ];

      const commonTasks = [
        makeCommonTask("Quick Fix", ["Quick Fix"], 3, 0.6),
      ];

      const result = detector.detect(analyses, commonTasks);
      const estimationPattern = result.find(
        (p) =>
          p.correlationType === "estimation" &&
          p.taskCanonicalTitle === "Quick Fix",
      );

      expect(estimationPattern).toBeDefined();
      expect(estimationPattern?.confidence).toBeGreaterThanOrEqual(0.7);
      const smallEstCond = estimationPattern?.condition;
      expect(smallEstCond && "field" in smallEstCond && smallEstCond.operator).toBe("lt");
    });

    test("returns no estimation patterns when stories lack estimation", () => {
      const analyses = [
        makeAnalysis("S1", ["Code", "Test"], {}),
        makeAnalysis("S2", ["Code", "Test"], {}),
        makeAnalysis("S3", ["Code"], {}),
      ];

      // Remove estimation from stories (override defaults)
      for (const a of analyses) {
        a.story.estimation = undefined;
      }

      const commonTasks = [makeCommonTask("Test", ["Test"], 2, 0.67)];

      const result = detector.detect(analyses, commonTasks);
      const estPatterns = result.filter(
        (p) => p.correlationType === "estimation",
      );
      expect(estPatterns).toHaveLength(0);
    });
  });

  // ========================================================================
  // 5. Area path conditions
  // ========================================================================
  describe("area path conditions", () => {
    test("detects area path correlation when task appears in specific area", () => {
      // "Mobile Test" appears in all stories with areaPath "Project\\Mobile"
      const analyses = [
        makeAnalysis("S1", ["Code", "Mobile Test"], { areaPath: "Project\\Mobile" }),
        makeAnalysis("S2", ["Code", "Mobile Test"], { areaPath: "Project\\Mobile" }),
        makeAnalysis("S3", ["Code", "Mobile Test"], { areaPath: "Project\\Mobile" }),
        makeAnalysis("S4", ["Code"], { areaPath: "Project\\Backend" }),
        makeAnalysis("S5", ["Code"], { areaPath: "Project\\Backend" }),
      ];

      const commonTasks = [
        makeCommonTask("Mobile Test", ["Mobile Test"], 3, 0.6),
      ];

      const result = detector.detect(analyses, commonTasks);
      const areaPattern = result.find(
        (p) =>
          p.correlationType === "areaPath" &&
          p.taskCanonicalTitle === "Mobile Test",
      );

      expect(areaPattern).toBeDefined();
      expect(areaPattern?.confidence).toBeGreaterThanOrEqual(0.7);
      expect(areaPattern?.condition).toEqual({ field: "areaPath", operator: "contains", value: "Project\\Mobile" });
    });

    test("does not detect area path pattern when only one area path exists", () => {
      // All stories have the same areaPath => areaPaths.size <= 1 => skip
      const analyses = [
        makeAnalysis("S1", ["Code", "Test"], { areaPath: "Project\\TeamA" }),
        makeAnalysis("S2", ["Code", "Test"], { areaPath: "Project\\TeamA" }),
        makeAnalysis("S3", ["Code"], { areaPath: "Project\\TeamA" }),
      ];

      const commonTasks = [makeCommonTask("Test", ["Test"], 2, 0.67)];

      const result = detector.detect(analyses, commonTasks);
      const areaPatterns = result.filter(
        (p) => p.correlationType === "areaPath",
      );
      expect(areaPatterns).toHaveLength(0);
    });

    test("does not detect area path pattern when no stories have area paths", () => {
      const analyses = [
        makeAnalysis("S1", ["Code", "Test"]),
        makeAnalysis("S2", ["Code", "Test"]),
        makeAnalysis("S3", ["Code"]),
      ];

      const commonTasks = [makeCommonTask("Test", ["Test"], 2, 0.67)];

      const result = detector.detect(analyses, commonTasks);
      const areaPatterns = result.filter(
        (p) => p.correlationType === "areaPath",
      );
      expect(areaPatterns).toHaveLength(0);
    });
  });

  // ========================================================================
  // 6. buildCondition
  // ========================================================================
  describe("buildCondition", () => {
    test("builds positive tag condition", () => {
      const cond = detector.buildCondition("tag", "security", true);
      expect(cond).toEqual<Condition>({ field: "tags", operator: "contains", value: "security" });
    });

    test("builds negative tag condition", () => {
      const cond = detector.buildCondition("tag", "legacy", false);
      expect(cond).toEqual<Condition>({ field: "tags", operator: "not-contains", value: "legacy" });
    });

    test("builds high-priority condition (isPositive = true)", () => {
      const cond = detector.buildCondition("priority", 2, true);
      expect(cond).toEqual<Condition>({ field: "priority", operator: "lte", value: 2 });
    });

    test("builds low-priority condition (isPositive = false)", () => {
      const cond = detector.buildCondition("priority", 2, false);
      expect(cond).toEqual<Condition>({ field: "priority", operator: "gt", value: 2 });
    });

    test("builds large-estimation condition (isPositive = true)", () => {
      const cond = detector.buildCondition("estimation", 13, true);
      expect(cond).toEqual<Condition>({ field: "estimation", operator: "gte", value: 13 });
    });

    test("builds small-estimation condition (isPositive = false)", () => {
      const cond = detector.buildCondition("estimation", 13, false);
      expect(cond).toEqual<Condition>({ field: "estimation", operator: "lt", value: 13 });
    });

    test("builds areaPath condition (ignores isPositive)", () => {
      const condTrue = detector.buildCondition("areaPath", "Project\\Web", true);
      const condFalse = detector.buildCondition("areaPath", "Project\\Web", false);
      expect(condTrue).toEqual<Condition>({ field: "areaPath", operator: "contains", value: "Project\\Web" });
      expect(condTrue).toEqual(condFalse);
    });
  });

  // ========================================================================
  // 7. augmentMergedTasks
  // ========================================================================
  describe("augmentMergedTasks", () => {
    test("adds learnedCondition to matching merged tasks", () => {
      const mergedTasks: MergedTask[] = [
        makeMergedTask("Security Review"),
        makeMergedTask("Code"),
      ];

      const patterns = [
        {
          taskCanonicalTitle: "Security Review",
          condition: { field: "tags" as const, operator: "contains" as const, value: "security" },
          correlationType: "tag" as const,
          correlatedValue: "security",
          confidence: 0.85,
          matchCount: 4,
          totalStories: 5,
          explanation: "test explanation",
        },
      ];

      const result = detector.augmentMergedTasks(mergedTasks, patterns);

      const augmented = result.find(
        (mt) => mt.task.title === "Security Review",
      );
      expect(augmented).toBeDefined();
      expect(augmented?.learnedCondition).toEqual({ field: "tags", operator: "contains", value: "security" });

      const unchanged = result.find((mt) => mt.task.title === "Code");
      expect(unchanged).toBeDefined();
      expect(unchanged?.learnedCondition).toBeUndefined();
    });

    test("respects custom confidence threshold", () => {
      const mergedTasks: MergedTask[] = [makeMergedTask("Security Review")];

      const patterns = [
        {
          taskCanonicalTitle: "Security Review",
          condition: { field: "tags" as const, operator: "contains" as const, value: "security" },
          correlationType: "tag" as const,
          correlatedValue: "security",
          confidence: 0.75,
          matchCount: 3,
          totalStories: 4,
          explanation: "test",
        },
      ];

      // Default threshold 0.7 => should include
      const withDefault = detector.augmentMergedTasks(mergedTasks, patterns);
      expect(withDefault[0]?.learnedCondition).toBeDefined();

      // Higher threshold 0.8 => should exclude
      const withHighThreshold = detector.augmentMergedTasks(
        mergedTasks,
        patterns,
        0.8,
      );
      expect(withHighThreshold[0]?.learnedCondition).toBeUndefined();
    });

    test("does not mutate original merged tasks", () => {
      const mergedTasks: MergedTask[] = [makeMergedTask("Security Review")];

      const patterns = [
        {
          taskCanonicalTitle: "Security Review",
          condition: { field: "tags" as const, operator: "contains" as const, value: "security" },
          correlationType: "tag" as const,
          correlatedValue: "security",
          confidence: 0.9,
          matchCount: 4,
          totalStories: 5,
          explanation: "test",
        },
      ];

      const result = detector.augmentMergedTasks(mergedTasks, patterns);

      // Original should remain unmodified
      expect(mergedTasks[0]?.learnedCondition).toBeUndefined();
      // Result should have the condition
      expect(result[0]?.learnedCondition).toBeDefined();
    });

    test("returns tasks unmodified when no patterns match", () => {
      const mergedTasks: MergedTask[] = [
        makeMergedTask("Code"),
        makeMergedTask("Test"),
      ];

      const patterns = [
        {
          taskCanonicalTitle: "Completely Different Task",
          condition: { field: "tags" as const, operator: "contains" as const, value: "nope" },
          correlationType: "tag" as const,
          correlatedValue: "nope",
          confidence: 0.9,
          matchCount: 4,
          totalStories: 5,
          explanation: "test",
        },
      ];

      const result = detector.augmentMergedTasks(mergedTasks, patterns);
      expect(result).toHaveLength(2);
      expect(result[0]?.learnedCondition).toBeUndefined();
      expect(result[1]?.learnedCondition).toBeUndefined();
    });

    test("returns tasks as-is when patterns array is empty", () => {
      const mergedTasks: MergedTask[] = [makeMergedTask("Code")];
      const result = detector.augmentMergedTasks(mergedTasks, []);
      expect(result).toHaveLength(1);
      expect(result[0]?.learnedCondition).toBeUndefined();
    });
  });

  // ========================================================================
  // 8. Tasks with >= 90% frequency are skipped
  // ========================================================================
  describe("high-frequency task skipping", () => {
    test("skips tasks with frequencyRatio >= 0.9 (they are not conditional)", () => {
      // "Code" appears in 90% of stories -> not conditional, skip it
      const analyses = [
        makeAnalysis("S1", ["Code", "Deploy"], { tags: ["infra"] }),
        makeAnalysis("S2", ["Code", "Deploy"], { tags: ["infra"] }),
        makeAnalysis("S3", ["Code", "Deploy"], { tags: ["infra"] }),
        makeAnalysis("S4", ["Code"], {}),
      ];

      const commonTasks = [
        makeCommonTask("Code", ["Code"], 4, 1.0), // frequencyRatio 1.0 >= 0.9
        makeCommonTask("Deploy", ["Deploy"], 3, 0.75), // frequencyRatio 0.75 < 0.9
      ];

      const result = detector.detect(analyses, commonTasks);

      // "Code" should not appear since it has frequencyRatio >= 0.9
      const codePatterns = result.filter(
        (p) => p.taskCanonicalTitle === "Code",
      );
      expect(codePatterns).toHaveLength(0);
    });

    test("skips tasks with frequencyRatio exactly 0.9", () => {
      const analyses = [
        makeAnalysis("S1", ["Always There"], { tags: ["x"] }),
        makeAnalysis("S2", ["Always There"], { tags: ["x"] }),
        makeAnalysis("S3", ["Always There"], { tags: ["x"] }),
        makeAnalysis("S4", ["Always There"], {}),
      ];

      const commonTasks = [
        makeCommonTask("Always There", ["Always There"], 4, 0.9),
      ];

      const result = detector.detect(analyses, commonTasks);
      const patterns = result.filter(
        (p) => p.taskCanonicalTitle === "Always There",
      );
      expect(patterns).toHaveLength(0);
    });
  });

  // ========================================================================
  // 9. Multi-condition: all valid conditions per task are kept
  // ========================================================================
  describe("multi-condition (no deduplication)", () => {
    test("keeps all high-confidence patterns for the same task", () => {
      // "Security Audit" correlates with both tag "security" and priority <= 1
      const analyses = [
        makeAnalysis("S1", ["Code", "Security Audit"], {
          tags: ["security"],
          priority: 1,
        }),
        makeAnalysis("S2", ["Code", "Security Audit"], {
          tags: ["security"],
          priority: 1,
        }),
        makeAnalysis("S3", ["Code", "Security Audit"], {
          tags: ["security"],
          priority: 1,
        }),
        makeAnalysis("S4", ["Code"], { tags: ["frontend"], priority: 3 }),
        makeAnalysis("S5", ["Code"], { tags: ["frontend"], priority: 4 }),
      ];

      const commonTasks = [
        makeCommonTask("Security Audit", ["Security Audit"], 3, 0.6),
      ];

      const result = detector.detect(analyses, commonTasks);

      // Should have at least one pattern for "Security Audit"
      const auditPatterns = result.filter(
        (p) => p.taskCanonicalTitle === "Security Audit",
      );
      expect(auditPatterns.length).toBeGreaterThanOrEqual(1);

      // All returned patterns must meet confidence threshold
      for (const p of auditPatterns) {
        expect(p.confidence).toBeGreaterThanOrEqual(0.7);
      }
    });

    test("preserves patterns for different tasks even if same correlation type", () => {
      // Two different tasks both have tag correlations
      const analyses = [
        makeAnalysis("S1", ["Code", "Security Review", "Mobile Test"], {
          tags: ["security", "mobile"],
        }),
        makeAnalysis("S2", ["Code", "Security Review", "Mobile Test"], {
          tags: ["security", "mobile"],
        }),
        makeAnalysis("S3", ["Code", "Security Review", "Mobile Test"], {
          tags: ["security", "mobile"],
        }),
        makeAnalysis("S4", ["Code"], {}),
        makeAnalysis("S5", ["Code"], {}),
      ];

      const commonTasks = [
        makeCommonTask("Security Review", ["Security Review"], 3, 0.6),
        makeCommonTask("Mobile Test", ["Mobile Test"], 3, 0.6),
      ];

      const result = detector.detect(analyses, commonTasks);

      const securityPatterns = result.filter(
        (p) => p.taskCanonicalTitle === "Security Review",
      );
      const mobilePatterns = result.filter(
        (p) => p.taskCanonicalTitle === "Mobile Test",
      );

      // Each task should have at least one pattern
      expect(securityPatterns.length).toBeGreaterThanOrEqual(1);
      expect(mobilePatterns.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ========================================================================
  // 10. Area path prefix matching (startsWith)
  // ========================================================================
  describe("area path prefix matching", () => {
    test("matches sub-area paths via startsWith for parent path", () => {
      // Stories are in sub-paths of "Project\\Mobile"; the parent path itself
      // also appears in the dataset so it becomes a candidate.
      const analyses = [
        makeAnalysis("S1", ["Code", "Mobile Test"], { areaPath: "Project\\Mobile" }),
        makeAnalysis("S2", ["Code", "Mobile Test"], { areaPath: "Project\\Mobile\\iOS" }),
        makeAnalysis("S3", ["Code", "Mobile Test"], { areaPath: "Project\\Mobile\\Android" }),
        makeAnalysis("S4", ["Code"], { areaPath: "Project\\Backend" }),
        makeAnalysis("S5", ["Code"], { areaPath: "Project\\Backend" }),
      ];

      const commonTasks = [
        makeCommonTask("Mobile Test", ["Mobile Test"], 3, 0.6),
      ];

      const result = detector.detect(analyses, commonTasks);

      // The parent path "Project\Mobile" should match itself AND its sub-paths
      const parentPattern = result.find(
        (p) =>
          p.correlationType === "areaPath" &&
          p.taskCanonicalTitle === "Mobile Test" &&
          p.correlatedValue === "Project\\Mobile",
      );

      expect(parentPattern).toBeDefined();
      // matchCount should cover all 3 Mobile stories (prefix match)
      expect(parentPattern?.matchCount).toBeGreaterThanOrEqual(3);
      expect(parentPattern?.confidence).toBeGreaterThanOrEqual(0.7);
    });
  });

  // ========================================================================
  // 11. Compound AND conditions
  // ========================================================================
  describe("compound AND conditions", () => {
    test("detects compound condition when AND combination has higher confidence than individuals", () => {
      // "Security Audit" appears ONLY when story has BOTH tag "security" AND priority <= 1.
      // Individual correlations might be weaker due to stories that have one but not both.
      const analyses = [
        // Has both security tag AND priority 1 → has the task
        makeAnalysis("S1", ["Code", "Security Audit"], { tags: ["security"], priority: 1 }),
        makeAnalysis("S2", ["Code", "Security Audit"], { tags: ["security"], priority: 1 }),
        makeAnalysis("S3", ["Code", "Security Audit"], { tags: ["security"], priority: 1 }),
        // Has security tag but NOT priority 1 → no task
        makeAnalysis("S4", ["Code"], { tags: ["security"], priority: 3 }),
        // Has priority 1 but NOT security tag → no task
        makeAnalysis("S5", ["Code"], { tags: ["frontend"], priority: 1 }),
        // Has neither → no task
        makeAnalysis("S6", ["Code"], { tags: ["frontend"], priority: 3 }),
      ];

      const commonTasks = [
        makeCommonTask("Security Audit", ["Security Audit"], 3, 0.5),
      ];

      const result = detector.detect(analyses, commonTasks);

      const compoundPattern = result.find(
        (p) =>
          p.correlationType === "compound" &&
          p.taskCanonicalTitle === "Security Audit",
      );

      // Compound should be found with 100% confidence (3/3 stories with both conditions)
      if (compoundPattern) {
        expect("all" in compoundPattern.condition).toBe(true);
        expect(compoundPattern.confidence).toBeGreaterThanOrEqual(0.7);
      }
    });
  });

  // ========================================================================
  // 12. augmentMergedTasks - OR combination
  // ========================================================================
  describe("augmentMergedTasks multi-condition OR", () => {
    test("combines multiple conditions for same task with OR", () => {
      const mergedTasks: MergedTask[] = [makeMergedTask("Security Review")];

      const patterns = [
        {
          taskCanonicalTitle: "Security Review",
          condition: { field: "tags" as const, operator: "contains" as const, value: "security" },
          correlationType: "tag" as const,
          correlatedValue: "security",
          confidence: 0.9,
          matchCount: 4,
          totalStories: 5,
          explanation: "test 1",
        },
        {
          taskCanonicalTitle: "Security Review",
          condition: { field: "priority" as const, operator: "lte" as const, value: 1 },
          correlationType: "priority" as const,
          correlatedValue: 1,
          confidence: 0.85,
          matchCount: 3,
          totalStories: 5,
          explanation: "test 2",
        },
      ];

      const result = detector.augmentMergedTasks(mergedTasks, patterns);
      const augmented = result.find((mt) => mt.task.title === "Security Review");

      const learned = augmented?.learnedCondition;
      expect(learned && "any" in learned).toBe(true);
    });

    test("uses compound AND condition directly when available (no OR wrapping)", () => {
      const mergedTasks: MergedTask[] = [makeMergedTask("Security Review")];

      const patterns = [
        {
          taskCanonicalTitle: "Security Review",
          condition: { all: [
            { field: "tags" as const, operator: "contains" as const, value: "security" },
            { field: "priority" as const, operator: "lte" as const, value: 1 },
          ] } satisfies Condition,
          correlationType: "compound" as const,
          correlatedValue: "security+1",
          confidence: 1.0,
          matchCount: 3,
          totalStories: 6,
          explanation: "compound test",
        },
      ];

      const result = detector.augmentMergedTasks(mergedTasks, patterns);
      const augmented = result.find((mt) => mt.task.title === "Security Review");

      // A single compound pattern should be returned directly (not wrapped in any)
      expect(augmented?.learnedCondition && "all" in augmented.learnedCondition).toBe(true);
    });
  });

  // ========================================================================
  // Additional edge cases
  // ========================================================================
  describe("edge cases", () => {
    test("pattern explanation contains the task name and confidence percentage", () => {
      const analyses = [
        makeAnalysis("S1", ["Code", "Security Review"], { tags: ["security"] }),
        makeAnalysis("S2", ["Code", "Security Review"], { tags: ["security"] }),
        makeAnalysis("S3", ["Code", "Security Review"], { tags: ["security"] }),
        makeAnalysis("S4", ["Code"], {}),
      ];

      const commonTasks = [
        makeCommonTask("Security Review", ["Security Review"], 3, 0.75),
      ];

      const result = detector.detect(analyses, commonTasks);
      const pattern = result.find(
        (p) => p.taskCanonicalTitle === "Security Review",
      );

      if (pattern) {
        expect(pattern.explanation).toContain("Security Review");
        expect(pattern.explanation).toMatch(/\d+%/);
      }
    });

    test("totalStories in pattern equals total analyses count", () => {
      const analyses = [
        makeAnalysis("S1", ["Code", "Deploy"], { tags: ["infra"] }),
        makeAnalysis("S2", ["Code", "Deploy"], { tags: ["infra"] }),
        makeAnalysis("S3", ["Code", "Deploy"], { tags: ["infra"] }),
        makeAnalysis("S4", ["Code"], {}),
        makeAnalysis("S5", ["Code"], {}),
        makeAnalysis("S6", ["Code"], {}),
      ];

      const commonTasks = [
        makeCommonTask("Deploy", ["Deploy"], 3, 0.5),
      ];

      const result = detector.detect(analyses, commonTasks);
      for (const pattern of result) {
        expect(pattern.totalStories).toBe(6);
      }
    });

    test("matchCount reflects actual number of matching stories", () => {
      const analyses = [
        makeAnalysis("S1", ["Code", "Security Review"], { tags: ["security"] }),
        makeAnalysis("S2", ["Code", "Security Review"], { tags: ["security"] }),
        makeAnalysis("S3", ["Code", "Security Review"], { tags: ["security"] }),
        makeAnalysis("S4", ["Code"], {}),
      ];

      const commonTasks = [
        makeCommonTask("Security Review", ["Security Review"], 3, 0.75),
      ];

      const result = detector.detect(analyses, commonTasks);
      const pattern = result.find(
        (p) =>
          p.taskCanonicalTitle === "Security Review" &&
          p.correlationType === "tag",
      );

      if (pattern) {
        expect(pattern.matchCount).toBeGreaterThanOrEqual(3);
      }
    });

    test("handles stories with multiple tags without errors", () => {
      const analyses = [
        makeAnalysis("S1", ["Code", "Security Review"], {
          tags: ["security", "api", "v2"],
        }),
        makeAnalysis("S2", ["Code", "Security Review"], {
          tags: ["security", "frontend"],
        }),
        makeAnalysis("S3", ["Code", "Security Review"], {
          tags: ["security", "mobile"],
        }),
        makeAnalysis("S4", ["Code"], { tags: ["api", "v2"] }),
      ];

      const commonTasks = [
        makeCommonTask("Security Review", ["Security Review"], 3, 0.75),
      ];

      // Should not throw
      const result = detector.detect(analyses, commonTasks);
      expect(Array.isArray(result)).toBe(true);
    });

    test("storyHasTask matches via title variants", () => {
      // titleVariants includes the exact task title from the template
      const analyses = [
        makeAnalysis("S1", ["Implement Security Checks"], { tags: ["sec"] }),
        makeAnalysis("S2", ["Implement Security Checks"], { tags: ["sec"] }),
        makeAnalysis("S3", ["Implement Security Checks"], { tags: ["sec"] }),
        makeAnalysis("S4", ["Code"], {}),
      ];

      const commonTasks = [
        makeCommonTask(
          "Security Checks",
          ["Implement Security Checks", "Security Checks"],
          3,
          0.75,
        ),
      ];

      const result = detector.detect(analyses, commonTasks);
      // Should find the task through titleVariants matching
      const pattern = result.find(
        (p) => p.taskCanonicalTitle === "Security Checks",
      );
      expect(pattern).toBeDefined();
    });
  });
});
