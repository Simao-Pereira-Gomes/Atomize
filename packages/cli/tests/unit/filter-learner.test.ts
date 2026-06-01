import { describe, expect, test } from "bun:test";
import type { WorkItem } from "@platforms/interfaces/work-item.interface";
import { FilterLearner } from "@services/template/pattern-detection";
import type {
  LearnedFilterCriteria,
  StoryAnalysis,
} from "@services/template/story-learner.types";
import type { FilterCriteria, TaskTemplate } from "@templates/schema";

/**
 * Helper to create a StoryAnalysis with configurable story-level properties.
 */
function makeAnalysis(
  storyId: string,
  overrides: {
    areaPath?: string;
    priority?: number;
    estimation?: number;
    tags?: string[];
  } = {},
): StoryAnalysis {
  const story: WorkItem = {
    id: storyId,
    title: `Story ${storyId}`,
    type: "User Story",
    state: "Active",
    estimation: overrides.estimation,
    tags: overrides.tags,
    priority: overrides.priority,
    areaPath: overrides.areaPath,
  };

  const template: TaskTemplate = {
    version: "1.0",
    name: `Template from ${storyId}`,
    description: "",
    filter: { workItemTypes: ["User Story"] },
    tasks: [
      {
        id: "task-1",
        title: "Default Task",
        estimationPercent: 100,
        activity: "Development",
      },
    ],
    estimation: { strategy: "percentage", rounding: "none" },
  };

  return {
    story,
    tasks: [
      {
        id: `${storyId}-task-0`,
        title: "Default Task",
        type: "Task",
        state: "Active",
        estimation: overrides.estimation ?? 10,
      },
    ],
    template,
    warnings: [],
  };
}

describe("FilterLearner", () => {
  const learner = new FilterLearner();

  describe("learn", () => {
    test("should return empty object for empty analyses", () => {
      const result = learner.learn([]);
      expect(result).toEqual({});
    });

    test("should return all filter criteria for populated analyses", () => {
      const analyses = [
        makeAnalysis("S1", {
          areaPath: "Project\\Team",
          priority: 2,
          estimation: 8,
          tags: ["frontend"],
        }),
        makeAnalysis("S2", {
          areaPath: "Project\\Team",
          priority: 3,
          estimation: 13,
          tags: ["frontend"],
        }),
      ];

      const result = learner.learn(analyses);

      expect(result.areaPaths).toBeDefined();
      expect(result.priorityRange).toBeDefined();
      expect(result.estimationRange).toBeDefined();
      expect(result.commonStoryTags).toBeDefined();
    });
  });

  describe("detectAreaPaths", () => {
    test("should detect common area paths above 50% frequency", () => {
      const analyses = [
        makeAnalysis("S1", { areaPath: "Project\\TeamA" }),
        makeAnalysis("S2", { areaPath: "Project\\TeamA" }),
        makeAnalysis("S3", { areaPath: "Project\\TeamA" }),
        makeAnalysis("S4", { areaPath: "Project\\TeamB" }),
      ];

      const result = learner.learn(analyses);

      expect(result.areaPaths).toBeDefined();
      expect(result.areaPaths?.values).toContain("Project\\TeamA");
      expect(result.areaPaths?.values).not.toContain("Project\\TeamB");
      expect(result.areaPaths?.frequency).toBe(3);
    });

    test("should return multiple area paths when each meets threshold", () => {
      const analyses = [
        makeAnalysis("S1", { areaPath: "Project\\TeamA" }),
        makeAnalysis("S2", { areaPath: "Project\\TeamA" }),
        makeAnalysis("S3", { areaPath: "Project\\TeamB" }),
        makeAnalysis("S4", { areaPath: "Project\\TeamB" }),
      ];

      const result = learner.learn(analyses);

      // Both paths appear in 50% of analyses (2 out of 4), meeting the 0.5 threshold
      expect(result.areaPaths).toBeDefined();
      expect(result.areaPaths?.values).toContain("Project\\TeamA");
      expect(result.areaPaths?.values).toContain("Project\\TeamB");
    });

    test("should fallback to most common path when none meets threshold", () => {
      const analyses = [
        makeAnalysis("S1", { areaPath: "Project\\TeamA" }),
        makeAnalysis("S2", { areaPath: "Project\\TeamA" }),
        makeAnalysis("S3", { areaPath: "Project\\TeamB" }),
        makeAnalysis("S4", { areaPath: "Project\\TeamC" }),
        makeAnalysis("S5", { areaPath: "Project\\TeamD" }),
      ];

      const result = learner.learn(analyses);

      // TeamA has 2/5 = 40%, below 50% threshold. Fallback to most common.
      expect(result.areaPaths).toBeDefined();
      expect(result.areaPaths?.values).toEqual(["Project\\TeamA"]);
      expect(result.areaPaths?.frequency).toBe(2);
    });

    test("should return undefined when no stories have area paths", () => {
      const analyses = [
        makeAnalysis("S1", {}),
        makeAnalysis("S2", {}),
      ];

      const result = learner.learn(analyses);

      expect(result.areaPaths).toBeUndefined();
    });
  });

  describe("detectPriorityRange", () => {
    test("should detect min, max, and most common priority", () => {
      const analyses = [
        makeAnalysis("S1", { priority: 1 }),
        makeAnalysis("S2", { priority: 2 }),
        makeAnalysis("S3", { priority: 2 }),
        makeAnalysis("S4", { priority: 3 }),
      ];

      const result = learner.learn(analyses);

      expect(result.priorityRange).toBeDefined();
      expect(result.priorityRange?.min).toBe(1);
      expect(result.priorityRange?.max).toBe(3);
      expect(result.priorityRange?.mostCommon).toBe(2);
    });

    test("should handle single priority value", () => {
      const analyses = [
        makeAnalysis("S1", { priority: 2 }),
        makeAnalysis("S2", { priority: 2 }),
      ];

      const result = learner.learn(analyses);

      expect(result.priorityRange).toBeDefined();
      expect(result.priorityRange?.min).toBe(2);
      expect(result.priorityRange?.max).toBe(2);
      expect(result.priorityRange?.mostCommon).toBe(2);
    });

    test("should return undefined when no stories have priority", () => {
      const analyses = [
        makeAnalysis("S1", {}),
        makeAnalysis("S2", {}),
      ];

      const result = learner.learn(analyses);

      expect(result.priorityRange).toBeUndefined();
    });

    test("should ignore stories without priority in the calculation", () => {
      const analyses = [
        makeAnalysis("S1", { priority: 1 }),
        makeAnalysis("S2", {}),
        makeAnalysis("S3", { priority: 4 }),
      ];

      const result = learner.learn(analyses);

      expect(result.priorityRange).toBeDefined();
      expect(result.priorityRange?.min).toBe(1);
      expect(result.priorityRange?.max).toBe(4);
    });
  });

  describe("detectEstimationRange", () => {
    test("should detect min, max, and average estimation", () => {
      const analyses = [
        makeAnalysis("S1", { estimation: 5 }),
        makeAnalysis("S2", { estimation: 8 }),
        makeAnalysis("S3", { estimation: 13 }),
      ];

      const result = learner.learn(analyses);

      expect(result.estimationRange).toBeDefined();
      expect(result.estimationRange?.min).toBe(5);
      expect(result.estimationRange?.max).toBe(13);
      // Average: (5 + 8 + 13) / 3 = 8.666... rounded to 2 decimals = 8.67
      expect(result.estimationRange?.average).toBe(8.67);
    });

    test("should return undefined when no stories have estimation", () => {
      const analyses = [
        makeAnalysis("S1", {}),
        makeAnalysis("S2", {}),
      ];

      const result = learner.learn(analyses);

      expect(result.estimationRange).toBeUndefined();
    });

    test("should skip zero estimations", () => {
      const analyses = [
        makeAnalysis("S1", { estimation: 0 }),
        makeAnalysis("S2", { estimation: 5 }),
        makeAnalysis("S3", { estimation: 10 }),
      ];

      const result = learner.learn(analyses);

      expect(result.estimationRange).toBeDefined();
      expect(result.estimationRange?.min).toBe(5);
      expect(result.estimationRange?.max).toBe(10);
      expect(result.estimationRange?.average).toBe(7.5);
    });

    test("should handle single estimation value", () => {
      const analyses = [
        makeAnalysis("S1", { estimation: 8 }),
      ];

      const result = learner.learn(analyses);

      expect(result.estimationRange).toBeDefined();
      expect(result.estimationRange?.min).toBe(8);
      expect(result.estimationRange?.max).toBe(8);
      expect(result.estimationRange?.average).toBe(8);
    });

    test("should round average to 2 decimal places", () => {
      const analyses = [
        makeAnalysis("S1", { estimation: 1 }),
        makeAnalysis("S2", { estimation: 2 }),
        makeAnalysis("S3", { estimation: 3 }),
      ];

      const result = learner.learn(analyses);

      // Average: (1 + 2 + 3) / 3 = 2.0
      expect(result.estimationRange?.average).toBe(2);
    });
  });

  describe("detectCommonStoryTags", () => {
    test("should detect tags with >= 20% frequency", () => {
      const analyses = [
        makeAnalysis("S1", { tags: ["frontend", "auth"] }),
        makeAnalysis("S2", { tags: ["frontend", "api"] }),
        makeAnalysis("S3", { tags: ["frontend"] }),
        makeAnalysis("S4", { tags: ["backend"] }),
        makeAnalysis("S5", { tags: ["backend"] }),
      ];

      const result = learner.learn(analyses);

      expect(result.commonStoryTags).toBeDefined();
      const tagNames = result.commonStoryTags?.map((t) => t.tag);
      // frontend: 3/5 = 60%, backend: 2/5 = 40%, auth: 1/5 = 20%, api: 1/5 = 20%
      expect(tagNames).toContain("frontend");
      expect(tagNames).toContain("backend");
      expect(tagNames).toContain("auth");
      expect(tagNames).toContain("api");
    });

    test("should exclude tags below 20% frequency", () => {
      const analyses = [
        makeAnalysis("S1", { tags: ["common"] }),
        makeAnalysis("S2", { tags: ["common"] }),
        makeAnalysis("S3", { tags: ["common"] }),
        makeAnalysis("S4", { tags: ["common"] }),
        makeAnalysis("S5", { tags: ["common"] }),
        makeAnalysis("S6", { tags: ["rare"] }),
      ];

      const result = learner.learn(analyses);

      expect(result.commonStoryTags).toBeDefined();
      const tagNames = result.commonStoryTags?.map((t) => t.tag);
      // common: 5/6 = 83%, rare: 1/6 = 16.67%
      expect(tagNames).toContain("common");
      expect(tagNames).not.toContain("rare");
    });

    test("should return undefined when no stories have tags", () => {
      const analyses = [
        makeAnalysis("S1", {}),
        makeAnalysis("S2", {}),
      ];

      const result = learner.learn(analyses);

      expect(result.commonStoryTags).toBeUndefined();
    });

    test("should sort tags by frequency descending", () => {
      const analyses = [
        makeAnalysis("S1", { tags: ["alpha", "beta", "gamma"] }),
        makeAnalysis("S2", { tags: ["beta", "gamma"] }),
        makeAnalysis("S3", { tags: ["gamma"] }),
      ];

      const result = learner.learn(analyses);

      expect(result.commonStoryTags).toBeDefined();
      // gamma: 3/3, beta: 2/3, alpha: 1/3
      expect(result.commonStoryTags?.[0]?.tag).toBe("gamma");
      expect(result.commonStoryTags?.[1]?.tag).toBe("beta");
      expect(result.commonStoryTags?.[2]?.tag).toBe("alpha");
    });

    test("should calculate correct frequency ratios", () => {
      const analyses = [
        makeAnalysis("S1", { tags: ["frontend"] }),
        makeAnalysis("S2", { tags: ["frontend"] }),
        makeAnalysis("S3", { tags: ["frontend"] }),
      ];

      const result = learner.learn(analyses);

      expect(result.commonStoryTags).toBeDefined();
      const frontendTag = result.commonStoryTags?.find(
        (t) => t.tag === "frontend",
      );
      expect(frontendTag).toBeDefined();
      expect(frontendTag?.frequency).toBe(3);
      expect(frontendTag?.frequencyRatio).toBe(1);
    });
  });

  describe("applyToTemplate", () => {
    test("should apply area paths to filter when option enabled", () => {
      const templateFilter: FilterCriteria = {
        workItemTypes: ["User Story"],
      };
      const learnedFilters: LearnedFilterCriteria = {
        areaPaths: {
          values: ["Project\\TeamA", "Project\\TeamB"],
          frequency: 5,
        },
      };

      const result = learner.applyToTemplate(templateFilter, learnedFilters, {
        includeAreaPaths: true,
      });

      expect(result.areaPaths).toEqual(["Project\\TeamA", "Project\\TeamB"]);
      expect(result.workItemTypes).toEqual(["User Story"]);
    });

    test("should apply priority to filter when option enabled", () => {
      const templateFilter: FilterCriteria = {
        workItemTypes: ["User Story"],
      };
      const learnedFilters: LearnedFilterCriteria = {
        priorityRange: { min: 1, max: 3, mostCommon: 2 },
      };

      const result = learner.applyToTemplate(templateFilter, learnedFilters, {
        includePriority: true,
      });

      expect(result.priority).toEqual({ min: 1, max: 3 });
    });

    test("should not apply area paths when option disabled", () => {
      const templateFilter: FilterCriteria = {
        workItemTypes: ["User Story"],
      };
      const learnedFilters: LearnedFilterCriteria = {
        areaPaths: {
          values: ["Project\\TeamA"],
          frequency: 5,
        },
      };

      const result = learner.applyToTemplate(templateFilter, learnedFilters, {
        includeAreaPaths: false,
      });

      expect(result.areaPaths).toBeUndefined();
    });

    test("should not apply priority when option disabled", () => {
      const templateFilter: FilterCriteria = {
        workItemTypes: ["User Story"],
      };
      const learnedFilters: LearnedFilterCriteria = {
        priorityRange: { min: 1, max: 3, mostCommon: 2 },
      };

      const result = learner.applyToTemplate(templateFilter, learnedFilters, {
        includePriority: false,
      });

      expect(result.priority).toBeUndefined();
    });

    test("should preserve existing template filter properties", () => {
      const templateFilter: FilterCriteria = {
        workItemTypes: ["User Story"],
        states: ["Active"],
        tags: { include: ["sprint-1"] },
      };
      const learnedFilters: LearnedFilterCriteria = {
        areaPaths: {
          values: ["Project\\TeamA"],
          frequency: 3,
        },
      };

      const result = learner.applyToTemplate(templateFilter, learnedFilters, {
        includeAreaPaths: true,
      });

      expect(result.workItemTypes).toEqual(["User Story"]);
      expect(result.states).toEqual(["Active"]);
      expect(result.tags).toEqual({ include: ["sprint-1"] });
      expect(result.areaPaths).toEqual(["Project\\TeamA"]);
    });

    test("should default options to empty when not provided", () => {
      const templateFilter: FilterCriteria = {
        workItemTypes: ["User Story"],
      };
      const learnedFilters: LearnedFilterCriteria = {
        areaPaths: { values: ["Project\\TeamA"], frequency: 3 },
        priorityRange: { min: 1, max: 3, mostCommon: 2 },
      };

      const result = learner.applyToTemplate(templateFilter, learnedFilters);

      // No options enabled, nothing should be applied
      expect(result.areaPaths).toBeUndefined();
      expect(result.priority).toBeUndefined();
    });

    test("should handle empty learned filters gracefully", () => {
      const templateFilter: FilterCriteria = {
        workItemTypes: ["User Story"],
      };
      const learnedFilters: LearnedFilterCriteria = {};

      const result = learner.applyToTemplate(templateFilter, learnedFilters, {
        includeAreaPaths: true,
        includePriority: true,
      });

      expect(result.areaPaths).toBeUndefined();
      expect(result.priority).toBeUndefined();
      expect(result.workItemTypes).toEqual(["User Story"]);
    });
  });

  describe("generateSuggestions", () => {
    test("should suggest adding single area path to filter", () => {
      const learnedFilters: LearnedFilterCriteria = {
        areaPaths: { values: ["Project\\TeamA"], frequency: 5 },
      };

      const suggestions = learner.generateSuggestions(learnedFilters);

      expect(suggestions).toHaveLength(1);
      expect(suggestions[0]?.type).toBe("improve-filter");
      expect(suggestions[0]?.severity).toBe("info");
      expect(suggestions[0]?.message).toContain("Project\\TeamA");
      expect(suggestions[0]?.message).toContain(
        "Consider adding this to the template filter",
      );
    });

    test("should suggest scoping when multiple area paths exist", () => {
      const learnedFilters: LearnedFilterCriteria = {
        areaPaths: {
          values: ["Project\\TeamA", "Project\\TeamB"],
          frequency: 3,
        },
      };

      const suggestions = learner.generateSuggestions(learnedFilters);

      expect(suggestions).toHaveLength(1);
      expect(suggestions[0]?.type).toBe("improve-filter");
      expect(suggestions[0]?.message).toContain("2 area paths");
      expect(suggestions[0]?.message).toContain(
        "Consider if the template should be scoped",
      );
    });

    test("should suggest priority filter when all priorities are the same", () => {
      const learnedFilters: LearnedFilterCriteria = {
        priorityRange: { min: 2, max: 2, mostCommon: 2 },
      };

      const suggestions = learner.generateSuggestions(learnedFilters);

      expect(suggestions).toHaveLength(1);
      expect(suggestions[0]?.type).toBe("improve-filter");
      expect(suggestions[0]?.message).toContain("priority 2");
      expect(suggestions[0]?.message).toContain(
        "Consider adding a priority filter",
      );
    });

    test("should suggest priority filter for narrow range", () => {
      const learnedFilters: LearnedFilterCriteria = {
        priorityRange: { min: 2, max: 3, mostCommon: 2 },
      };

      const suggestions = learner.generateSuggestions(learnedFilters);

      expect(suggestions).toHaveLength(1);
      expect(suggestions[0]?.type).toBe("improve-filter");
      expect(suggestions[0]?.message).toContain("narrow priority range (2-3)");
    });

    test("should not suggest priority filter for wide range", () => {
      const learnedFilters: LearnedFilterCriteria = {
        priorityRange: { min: 1, max: 5, mostCommon: 3 },
      };

      const suggestions = learner.generateSuggestions(learnedFilters);

      expect(suggestions).toHaveLength(0);
    });

    test("should suggest estimation info for similar estimations", () => {
      const learnedFilters: LearnedFilterCriteria = {
        estimationRange: { min: 5, max: 8, average: 6.5 },
      };

      const suggestions = learner.generateSuggestions(learnedFilters);

      expect(suggestions).toHaveLength(1);
      expect(suggestions[0]?.type).toBe("improve-filter");
      expect(suggestions[0]?.message).toContain("similar estimations (5-8");
      expect(suggestions[0]?.message).toContain("avg 6.5");
    });

    test("should not suggest estimation info for wide estimation range", () => {
      const learnedFilters: LearnedFilterCriteria = {
        estimationRange: { min: 2, max: 21, average: 10 },
      };

      const suggestions = learner.generateSuggestions(learnedFilters);

      expect(suggestions).toHaveLength(0);
    });

    test("should suggest adding high-frequency tags to filter", () => {
      const learnedFilters: LearnedFilterCriteria = {
        commonStoryTags: [
          { tag: "frontend", frequency: 9, frequencyRatio: 0.9 },
          { tag: "api", frequency: 3, frequencyRatio: 0.3 },
        ],
      };

      const suggestions = learner.generateSuggestions(learnedFilters);

      expect(suggestions).toHaveLength(1);
      expect(suggestions[0]?.type).toBe("improve-filter");
      expect(suggestions[0]?.message).toContain("frontend");
      expect(suggestions[0]?.message).toContain("80%+");
      // "api" is below 80% so should not appear in the tag suggestion
      expect(suggestions[0]?.message).not.toContain("api");
    });

    test("should not suggest tags when none reach 80% threshold", () => {
      const learnedFilters: LearnedFilterCriteria = {
        commonStoryTags: [
          { tag: "alpha", frequency: 3, frequencyRatio: 0.5 },
          { tag: "beta", frequency: 2, frequencyRatio: 0.4 },
        ],
      };

      const suggestions = learner.generateSuggestions(learnedFilters);

      expect(suggestions).toHaveLength(0);
    });

    test("should return empty suggestions for empty learned filters", () => {
      const suggestions = learner.generateSuggestions({});

      expect(suggestions).toEqual([]);
    });

    test("should combine multiple suggestion types", () => {
      const learnedFilters: LearnedFilterCriteria = {
        areaPaths: { values: ["Project\\TeamA"], frequency: 5 },
        priorityRange: { min: 2, max: 2, mostCommon: 2 },
        estimationRange: { min: 5, max: 8, average: 6.5 },
        commonStoryTags: [
          { tag: "frontend", frequency: 9, frequencyRatio: 0.9 },
        ],
      };

      const suggestions = learner.generateSuggestions(learnedFilters);

      // One for area path, one for priority, one for estimation, one for tags
      expect(suggestions).toHaveLength(4);
      const types = suggestions.map((s) => s.type);
      expect(types.every((t) => t === "improve-filter")).toBe(true);
    });
  });

  describe("getSummary", () => {
    test("should return 'No filter criteria learned' for empty filters", () => {
      const summary = learner.getSummary({});
      expect(summary).toBe("No filter criteria learned");
    });

    test("should include area paths in summary", () => {
      const summary = learner.getSummary({
        areaPaths: {
          values: ["Project\\TeamA", "Project\\TeamB"],
          frequency: 5,
        },
      });

      expect(summary).toContain("Area paths: Project\\TeamA, Project\\TeamB");
    });

    test("should include priority range in summary", () => {
      const summary = learner.getSummary({
        priorityRange: { min: 1, max: 3, mostCommon: 2 },
      });

      expect(summary).toContain("Priority range: 1-3 (most common: 2)");
    });

    test("should include estimation range in summary", () => {
      const summary = learner.getSummary({
        estimationRange: { min: 5, max: 13, average: 8.67 },
      });

      expect(summary).toContain("Estimation range: 5-13 (average: 8.67)");
    });

    test("should include common tags in summary", () => {
      const summary = learner.getSummary({
        commonStoryTags: [
          { tag: "frontend", frequency: 5, frequencyRatio: 0.83 },
          { tag: "api", frequency: 3, frequencyRatio: 0.5 },
        ],
      });

      expect(summary).toContain("Common tags:");
      expect(summary).toContain("frontend (83%)");
      expect(summary).toContain("api (50%)");
    });

    test("should limit tags to top 5 in summary", () => {
      const tags = Array.from({ length: 8 }, (_, i) => ({
        tag: `tag-${i}`,
        frequency: 8 - i,
        frequencyRatio: (8 - i) / 10,
      }));

      const summary = learner.getSummary({
        commonStoryTags: tags,
      });

      // Only first 5 tags should appear
      expect(summary).toContain("tag-0");
      expect(summary).toContain("tag-4");
      expect(summary).not.toContain("tag-5");
    });

    test("should combine all parts with newlines", () => {
      const summary = learner.getSummary({
        areaPaths: { values: ["Project\\TeamA"], frequency: 5 },
        priorityRange: { min: 1, max: 3, mostCommon: 2 },
        estimationRange: { min: 5, max: 13, average: 8.67 },
        commonStoryTags: [
          { tag: "frontend", frequency: 5, frequencyRatio: 0.83 },
        ],
      });

      const lines = summary.split("\n");
      expect(lines).toHaveLength(4);
      expect(lines[0]).toContain("Area paths:");
      expect(lines[1]).toContain("Priority range:");
      expect(lines[2]).toContain("Estimation range:");
      expect(lines[3]).toContain("Common tags:");
    });
  });
});
