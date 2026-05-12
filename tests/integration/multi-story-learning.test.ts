import { describe, expect, test } from "bun:test";
import type { StoryLearningPlatform } from "@platforms/interfaces/platform-capabilities";
import type { WorkItem } from "@platforms/interfaces/work-item.interface";
import { StoryLearner } from "@services/template/story-learner";
import { TemplateValidator } from "@templates/validator";
import { TemplateGenerationError } from "@/utils/errors";

/**
 * Mock platform with realistic multi-story data.
 */
function createMultiStoryMockPlatform(): StoryLearningPlatform {
  const stories: Record<string, WorkItem> = {
    "STORY-100": {
      id: "STORY-100",
      title: "User authentication",
      type: "User Story",
      state: "Active",
      estimation: 20,
      tags: ["auth", "backend"],
    },
    "STORY-101": {
      id: "STORY-101",
      title: "User registration",
      type: "User Story",
      state: "Active",
      estimation: 15,
      tags: ["auth"],
    },
    "STORY-102": {
      id: "STORY-102",
      title: "Password reset",
      type: "User Story",
      state: "Active",
      estimation: 13,
      tags: ["auth", "security"],
    },
    "STORY-EMPTY": {
      id: "STORY-EMPTY",
      title: "Empty story with no tasks",
      type: "User Story",
      state: "New",
      estimation: 5,
    },
    "STORY-SINGLE": {
      id: "STORY-SINGLE",
      title: "Single task story",
      type: "User Story",
      state: "Active",
      estimation: 8,
    },
  };

  const children: Record<string, WorkItem[]> = {
    "STORY-100": [
      { id: "T100-1", title: "Design API endpoints", type: "Task", state: "Active", estimation: 3 },
      { id: "T100-2", title: "Implement authentication logic", type: "Task", state: "Active", estimation: 8 },
      { id: "T100-3", title: "Write unit tests", type: "Task", state: "Active", estimation: 5 },
      { id: "T100-4", title: "Code review", type: "Task", state: "Active", estimation: 2 },
      { id: "T100-5", title: "Deploy to staging", type: "Task", state: "Active", estimation: 2 },
    ],
    "STORY-101": [
      { id: "T101-1", title: "Design API endpoints", type: "Task", state: "Active", estimation: 2 },
      { id: "T101-2", title: "Implement registration logic", type: "Task", state: "Active", estimation: 6 },
      { id: "T101-3", title: "Write unit tests", type: "Task", state: "Active", estimation: 4 },
      { id: "T101-4", title: "Code review", type: "Task", state: "Active", estimation: 1.5 },
      { id: "T101-5", title: "Deploy to staging", type: "Task", state: "Active", estimation: 1.5 },
    ],
    "STORY-102": [
      { id: "T102-1", title: "Design API endpoints", type: "Task", state: "Active", estimation: 2 },
      { id: "T102-2", title: "Implement reset logic", type: "Task", state: "Active", estimation: 5 },
      { id: "T102-3", title: "Write unit tests", type: "Task", state: "Active", estimation: 3 },
      { id: "T102-4", title: "Code review", type: "Task", state: "Active", estimation: 1.5 },
      { id: "T102-5", title: "Deploy to staging", type: "Task", state: "Active", estimation: 1.5 },
    ],
    "STORY-EMPTY": [],
    "STORY-SINGLE": [
      { id: "T-SINGLE-1", title: "Quick bug fix", type: "Task", state: "Active", estimation: 8 },
    ],
  };

  return {
    getWorkItem: async (id: string) => stories[id] ?? null,
    getChildren: async (parentId: string) => children[parentId] ?? [],
  };
}

describe("Multi-Story Learning Integration", () => {
  const platform = createMultiStoryMockPlatform();
  const validator = new TemplateValidator();

  test("should learn from multiple stories end-to-end", async () => {
    const learner = new StoryLearner(platform);

    const result = await learner.learnFromStories(
      ["STORY-100", "STORY-101", "STORY-102"],
    );

    // All 3 stories analyzed
    expect(result.analyses).toHaveLength(3);
    expect(result.skipped).toHaveLength(0);

    // Learned template should have tasks
    expect(result.template.tasks.length).toBeGreaterThan(0);
    expect(result.template.name).toContain("3 stories");

    // Confidence should be defined
    expect(result.confidence.overall).toBeGreaterThan(0);
    expect(["high", "medium", "low"]).toContain(result.confidence.level);

    // Patterns detected
    expect(result.patterns.commonTasks.length).toBeGreaterThan(0);
    expect(result.patterns.averageTaskCount).toBe(5);

    // Should have detected common tasks like "Design API endpoints",
    // "Write unit tests", "Code review", "Deploy to staging"
    const commonTitles = result.patterns.commonTasks
      .filter((t) => t.frequencyRatio >= 0.9)
      .map((t) => t.canonicalTitle);
    expect(commonTitles.length).toBeGreaterThanOrEqual(3);
  });

  test("should handle mix of valid and empty stories", async () => {
    const learner = new StoryLearner(platform);

    const result = await learner.learnFromStories(
      ["STORY-100", "STORY-EMPTY", "STORY-101"],
    );

    expect(result.analyses).toHaveLength(2);
    expect(result.skipped).toHaveLength(1);
    const skippedItem = result.skipped[0];
    expect(skippedItem).toBeDefined();
    expect(skippedItem?.storyId).toBe("STORY-EMPTY");

    // Should still produce a valid merged template
    expect(result.template.tasks.length).toBeGreaterThan(0);
  });

  test("should produce a valid TaskTemplate that passes TemplateValidator", async () => {
    const learner = new StoryLearner(platform);

    const result = await learner.learnFromStories(
      ["STORY-100", "STORY-101", "STORY-102"],
    );

    const validation = validator.validate(result.template);

    // The merged template should pass validation
    expect(validation.valid).toBe(true);
    expect(validation.errors).toHaveLength(0);
  });

  test("should produce meaningful confidence scores", async () => {
    const learner = new StoryLearner(platform);

    // 3 very similar stories => should get decent confidence
    const result = await learner.learnFromStories(
      ["STORY-100", "STORY-101", "STORY-102"],
    );

    expect(result.confidence.overall).toBeGreaterThanOrEqual(40);
    expect(result.confidence.factors.length).toBe(7);

    // Each factor should have a description
    for (const factor of result.confidence.factors) {
      expect(factor.name).toBeTruthy();
      expect(factor.description).toBeTruthy();
      expect(factor.weight).toBeGreaterThan(0);
    }
  });

  test("should handle single story in multi-story mode", async () => {
    const learner = new StoryLearner(platform);

    const result = await learner.learnFromStories(
      ["STORY-100"],
    );

    expect(result.analyses).toHaveLength(1);
    expect(result.template.tasks.length).toBeGreaterThan(0);
    // Single story => low confidence due to sample-size multiplier (0.5)
    expect(result.confidence.overall).toBeLessThan(50);
  });

  test("should handle single-task story in multi-story mode", async () => {
    const learner = new StoryLearner(platform);

    const result = await learner.learnFromStories(
      ["STORY-100", "STORY-SINGLE"],
    );

    expect(result.analyses).toHaveLength(2);

    // Check that the single-task story produced a warning
    const singleAnalysis = result.analyses.find(
      (a) => a.story.id === "STORY-SINGLE"
    );
    expect(singleAnalysis).toBeDefined();
    expect(singleAnalysis?.warnings.some((w) => w.includes("only 1 task"))).toBe(true);
  });

  test("should throw when all stories have no tasks", async () => {
    const learner = new StoryLearner(platform);

    expect(
      learner.learnFromStories(
        ["STORY-EMPTY"],
      )
    ).rejects.toThrow(TemplateGenerationError);
  });

  test("should generate template variations", async () => {
    const learner = new StoryLearner(platform);

    const result = await learner.learnFromStories(
      ["STORY-100", "STORY-101", "STORY-102"],
    );

    expect(result.variations.length).toBeGreaterThanOrEqual(1);
    for (const variation of result.variations) {
      expect(variation.name).toBeTruthy();
      expect(variation.template.tasks.length).toBeGreaterThan(0);
      expect(variation.confidence).toBeDefined();
    }
  });
});
