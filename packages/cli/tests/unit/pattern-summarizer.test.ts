import { describe, expect, test } from "bun:test";
import { summarizePatterns } from "@services/template/pattern-summarizer";
import type { PatternDetectionResult } from "@services/template/story-learner.types";

function makePatterns(overrides: Partial<PatternDetectionResult> = {}): PatternDetectionResult {
  return {
    commonTasks: [],
    activityDistribution: {},
    averageTaskCount: 3,
    taskCountStdDev: 0.5,
    estimationPattern: { averageTotalEstimation: 100 },
    dependencyPatterns: [],
    conditionalPatterns: [],
    learnedFilters: {},
    tagDistribution: {},
    ...overrides,
  };
}

describe("summarizePatterns", () => {
  test("returns empty string for patterns with no tasks, deps, or conditions", () => {
    const result = summarizePatterns(makePatterns());
    expect(result).toBe("");
  });

  test("includes task titles with estimation and activity", () => {
    const patterns = makePatterns({
      commonTasks: [
        {
          canonicalTitle: "Design",
          titleVariants: ["Design"],
          frequency: 5,
          frequencyRatio: 1,
          averageEstimationPercent: 20,
          estimationStdDev: 0,
          activity: "Design",
        },
        {
          canonicalTitle: "Implement",
          titleVariants: ["Implement"],
          frequency: 5,
          frequencyRatio: 1,
          averageEstimationPercent: 60,
          estimationStdDev: 0,
          activity: "Development",
        },
        {
          canonicalTitle: "Test",
          titleVariants: ["Test"],
          frequency: 5,
          frequencyRatio: 1,
          averageEstimationPercent: 20,
          estimationStdDev: 0,
          activity: "Testing",
        },
      ],
    });

    const result = summarizePatterns(patterns);
    expect(result).toContain("Design");
    expect(result).toContain("20%");
    expect(result).toContain("Implement");
    expect(result).toContain("60%");
  });

  test("sorts tasks by frequency descending", () => {
    const patterns = makePatterns({
      commonTasks: [
        {
          canonicalTitle: "Rare Task",
          titleVariants: [],
          frequency: 1,
          frequencyRatio: 0.2,
          averageEstimationPercent: 50,
          estimationStdDev: 0,
          activity: "Development",
        },
        {
          canonicalTitle: "Common Task",
          titleVariants: [],
          frequency: 5,
          frequencyRatio: 1,
          averageEstimationPercent: 50,
          estimationStdDev: 0,
          activity: "Development",
        },
      ],
    });

    const result = summarizePatterns(patterns);
    const commonIdx = result.indexOf("Common Task");
    const rareIdx = result.indexOf("Rare Task");
    expect(commonIdx).toBeLessThan(rareIdx);
  });

  test("caps tasks at 8 entries", () => {
    const tasks = Array.from({ length: 12 }, (_, i) => ({
      canonicalTitle: `Task ${i}`,
      titleVariants: [],
      frequency: 10 - i,
      frequencyRatio: 1,
      averageEstimationPercent: 8,
      estimationStdDev: 0,
      activity: "Development",
    }));

    const result = summarizePatterns(makePatterns({ commonTasks: tasks }));
    const matches = result.match(/Task \d+/g) ?? [];
    expect(matches.length).toBeLessThanOrEqual(8);
  });

  test("includes dependency ordering when dependsOn is set", () => {
    const patterns = makePatterns({
      commonTasks: [
        {
          canonicalTitle: "Design",
          titleVariants: [],
          frequency: 5,
          frequencyRatio: 1,
          averageEstimationPercent: 25,
          estimationStdDev: 0,
          activity: "Design",
        },
        {
          canonicalTitle: "Implement",
          titleVariants: [],
          frequency: 5,
          frequencyRatio: 1,
          averageEstimationPercent: 75,
          estimationStdDev: 0,
          activity: "Development",
          dependsOn: ["Design"],
        },
      ],
    });

    const result = summarizePatterns(patterns);
    expect(result).toContain("Dependency ordering");
    expect(result).toContain("Design → Implement");
  });

  test("excludes conditional patterns below 20% confidence", () => {
    const patterns = makePatterns({
      conditionalPatterns: [
        {
          taskCanonicalTitle: "Testing",
          condition: { field: "Priority", operator: "lte" as const, value: 2 },
          correlationType: "priority" as const,
          correlatedValue: 2,
          confidence: 0.1,
          matchCount: 1,
          totalStories: 10,
          explanation: "Testing appears when priority is high",
        },
      ],
    });

    const result = summarizePatterns(patterns);
    expect(result).not.toContain("Testing appears when priority is high");
  });

  test("includes conditional patterns at or above 20% confidence", () => {
    const patterns = makePatterns({
      conditionalPatterns: [
        {
          taskCanonicalTitle: "Testing",
          condition: { field: "Priority", operator: "lte" as const, value: 2 },
          correlationType: "priority" as const,
          correlatedValue: 2,
          confidence: 0.5,
          matchCount: 5,
          totalStories: 10,
          explanation: "Testing appears when priority is high",
        },
      ],
    });

    const result = summarizePatterns(patterns);
    expect(result).toContain("Testing appears when priority is high");
  });

  test("output stays under 800-token budget for large pattern sets", () => {
    const tasks = Array.from({ length: 20 }, (_, i) => ({
      canonicalTitle: `Very Long Task Title Number ${i} That Takes Up Space`,
      titleVariants: [],
      frequency: 20 - i,
      frequencyRatio: 1,
      averageEstimationPercent: 5,
      estimationStdDev: 0,
      activity: "Development",
    }));

    const conditions = Array.from({ length: 10 }, (_, i) => ({
      taskCanonicalTitle: `Task ${i}`,
      condition: { field: "Priority", operator: "lte" as const, value: i },
      correlationType: "priority" as const,
      correlatedValue: i,
      confidence: 0.9,
      matchCount: 9,
      totalStories: 10,
      explanation: `Long conditional explanation number ${i} with lots of text to fill up the token budget`,
    }));

    const result = summarizePatterns(makePatterns({ commonTasks: tasks, conditionalPatterns: conditions }));
    const estimatedTokens = Math.ceil(result.length / 4);
    expect(estimatedTokens).toBeLessThanOrEqual(800);
  });
});
