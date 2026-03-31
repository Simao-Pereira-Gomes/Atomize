import { describe, expect, test } from "bun:test";
import type { IPlatformAdapter } from "@platforms/interfaces/platform.interface";
import type { WorkItem } from "@platforms/interfaces/work-item.interface";
import { StoryLearner } from "@services/template/story-learner";
import { TemplateGenerationError } from "@/utils/errors";

/**
 * Creates a mock platform adapter with configurable work items and children.
 */
function createMockPlatform(
  items: Record<string, WorkItem>,
  children: Record<string, WorkItem[]>,
): IPlatformAdapter {
  return {
    authenticate: async () => {},
    getConnectUserEmail: async () => "test@example.com",
    queryWorkItems: async () => [],
    createTask: async () => ({
      id: "new",
      title: "",
      type: "Task",
      state: "New",
    }),
    createTasksBulk: async () => [],
    getPlatformMetadata: () => ({ name: "mock", version: "1.0" }),
    getWorkItem: async (id: string) => items[id] ?? null,
    getChildren: async (parentId: string) => children[parentId] ?? [],
  };
}

// -- Test data --

const story1: WorkItem = {
  id: "STORY-1",
  title: "Implement login",
  type: "User Story",
  state: "Active",
  estimation: 20,
  tags: ["auth"],
};

const story2: WorkItem = {
  id: "STORY-2",
  title: "Implement signup",
  type: "User Story",
  state: "Active",
  estimation: 15,
  tags: ["auth"],
};

const story3: WorkItem = {
  id: "STORY-3",
  title: "Empty story",
  type: "User Story",
  state: "New",
  estimation: 10,
};

const tasksForStory1: WorkItem[] = [
  {
    id: "T1",
    title: "Design API",
    type: "Task",
    state: "Active",
    estimation: 4,
  },
  {
    id: "T2",
    title: "Implement logic",
    type: "Task",
    state: "Active",
    estimation: 10,
  },
  {
    id: "T3",
    title: "Write tests",
    type: "Task",
    state: "Active",
    estimation: 6,
  },
];

const tasksForStory2: WorkItem[] = [
  {
    id: "T4",
    title: "Design API",
    type: "Task",
    state: "Active",
    estimation: 3,
  },
  {
    id: "T5",
    title: "Implement logic",
    type: "Task",
    state: "Active",
    estimation: 7,
  },
  {
    id: "T6",
    title: "Write tests",
    type: "Task",
    state: "Active",
    estimation: 5,
  },
];

describe("StoryLearner", () => {
  describe("learnFromStory", () => {
    test("should throw TemplateGenerationError when story not found", async () => {
      const platform = createMockPlatform({}, {});
      const learner = new StoryLearner(platform);

      expect(learner.learnFromStory("NONEXISTENT")).rejects.toThrow(
        TemplateGenerationError,
      );
    });

    test("should throw TemplateGenerationError when story has no tasks", async () => {
      const platform = createMockPlatform(
        { "STORY-3": story3 },
        { "STORY-3": [] },
      );
      const learner = new StoryLearner(platform);

      expect(learner.learnFromStory("STORY-3")).rejects.toThrow(
        TemplateGenerationError,
      );
    });

    test("should generate template from story with tasks", async () => {
      const platform = createMockPlatform(
        { "STORY-1": story1 },
        { "STORY-1": tasksForStory1 },
      );
      const learner = new StoryLearner(platform);

      const template = await learner.learnFromStory("STORY-1");
      expect(template.tasks).toHaveLength(3);
      expect(template.name).toContain("STORY-1");
      expect(template.filter.workItemTypes).toContain("User Story");
    });

    test("should normalise percentages to 100% when total is less than 100%", async () => {
      const platform = createMockPlatform(
        { "STORY-1": story1 },
        { "STORY-1": tasksForStory1 },
      );
      const learner = new StoryLearner(platform);

      const template = await learner.learnFromStory("STORY-1");
      const total = template.tasks.reduce(
        (sum, t) => sum + (t.estimationPercent ?? 0),
        0,
      );
      expect(total).toBe(100);
    });
  });

  describe("learnFromStories", () => {
    test("should throw when empty story IDs array", async () => {
      const platform = createMockPlatform({}, {});
      const learner = new StoryLearner(platform);

      expect(
        learner.learnFromStories([]),
      ).rejects.toThrow(TemplateGenerationError);
    });

    test("should analyze multiple stories", async () => {
      const platform = createMockPlatform(
        { "STORY-1": story1, "STORY-2": story2 },
        { "STORY-1": tasksForStory1, "STORY-2": tasksForStory2 },
      );
      const learner = new StoryLearner(platform);

      const result = await learner.learnFromStories(["STORY-1", "STORY-2"]);

      expect(result.analyses).toHaveLength(2);
      expect(result.skipped).toHaveLength(0);
      expect(result.mergedTemplate.tasks.length).toBeGreaterThan(0);
    });

    test("should skip stories with no tasks", async () => {
      const platform = createMockPlatform(
        { "STORY-1": story1, "STORY-3": story3 },
        { "STORY-1": tasksForStory1, "STORY-3": [] },
      );
      const learner = new StoryLearner(platform);

      const result = await learner.learnFromStories(["STORY-1", "STORY-3"]);

      expect(result.analyses).toHaveLength(1);
      expect(result.skipped).toHaveLength(1);
      const skippedItem = result.skipped[0];
      expect(skippedItem).toBeDefined();
      expect(skippedItem?.storyId).toBe("STORY-3");
      expect(skippedItem?.reason).toContain("No child tasks");
    });

    test("should skip stories that are not found", async () => {
      const platform = createMockPlatform(
        { "STORY-1": story1 },
        { "STORY-1": tasksForStory1 },
      );
      const learner = new StoryLearner(platform);

      const result = await learner.learnFromStories(
        ["STORY-1", "NONEXISTENT"],
      );

      expect(result.analyses).toHaveLength(1);
      expect(result.skipped).toHaveLength(1);
      const skippedItem = result.skipped[0];
      expect(skippedItem).toBeDefined();
      expect(skippedItem?.storyId).toBe("NONEXISTENT");
    });

    test("should throw when all stories are skipped", async () => {
      const platform = createMockPlatform(
        { "STORY-3": story3 },
        { "STORY-3": [] },
      );
      const learner = new StoryLearner(platform);

      expect(
        learner.learnFromStories(["STORY-3"]),
      ).rejects.toThrow(TemplateGenerationError);
    });

    test("should return confidence score", async () => {
      const platform = createMockPlatform(
        { "STORY-1": story1, "STORY-2": story2 },
        { "STORY-1": tasksForStory1, "STORY-2": tasksForStory2 },
      );
      const learner = new StoryLearner(platform);

      const result = await learner.learnFromStories(["STORY-1", "STORY-2"]);

      expect(result.confidence).toBeDefined();
      expect(result.confidence.overall).toBeGreaterThanOrEqual(0);
      expect(result.confidence.overall).toBeLessThanOrEqual(100);
      expect(["high", "medium", "low"]).toContain(result.confidence.level);
      expect(result.confidence.factors.length).toBeGreaterThan(0);
    });

    test("should return pattern detection results", async () => {
      const platform = createMockPlatform(
        { "STORY-1": story1, "STORY-2": story2 },
        { "STORY-1": tasksForStory1, "STORY-2": tasksForStory2 },
      );
      const learner = new StoryLearner(platform);

      const result = await learner.learnFromStories(["STORY-1", "STORY-2"]);

      expect(result.patterns).toBeDefined();
      expect(result.patterns.commonTasks.length).toBeGreaterThan(0);
      expect(result.patterns.averageTaskCount).toBeGreaterThan(0);
    });

    test("should return suggestions", async () => {
      const platform = createMockPlatform(
        { "STORY-1": story1 },
        { "STORY-1": tasksForStory1 },
      );
      const learner = new StoryLearner(platform);

      const result = await learner.learnFromStories(["STORY-1"]);

      // Single story => low confidence => should get suggestion to add more
      expect(result.suggestions).toBeDefined();
      expect(Array.isArray(result.suggestions)).toBe(true);
    });

    test("should return template variations", async () => {
      const platform = createMockPlatform(
        { "STORY-1": story1, "STORY-2": story2 },
        { "STORY-1": tasksForStory1, "STORY-2": tasksForStory2 },
      );
      const learner = new StoryLearner(platform);

      const result = await learner.learnFromStories(["STORY-1", "STORY-2"]);

      expect(result.variations).toBeDefined();
      expect(Array.isArray(result.variations)).toBe(true);
    });

    test("should merge tasks from multiple stories", async () => {
      const platform = createMockPlatform(
        { "STORY-1": story1, "STORY-2": story2 },
        { "STORY-1": tasksForStory1, "STORY-2": tasksForStory2 },
      );
      const learner = new StoryLearner(platform);

      const result = await learner.learnFromStories(["STORY-1", "STORY-2"]);

      // Both stories have "Design API", "Implement logic", "Write tests"
      // so they should merge into 3 tasks, not 6
      expect(result.mergedTemplate.tasks.length).toBeLessThanOrEqual(4);
      expect(result.mergedTemplate.tasks.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("extractTitlePattern", () => {
    test("should replace story title with variable", () => {
      const learner = new StoryLearner(createMockPlatform({}, {}));
      const result = learner.extractTitlePattern(
        "Implement login feature",
        "login",
      );
      // biome-ignore lint/suspicious/noTemplateCurlyInString: testing template variable replacement
      expect(result).toContain("${story.title}");
    });

    test("should replace story ID patterns with variable", () => {
      const learner = new StoryLearner(createMockPlatform({}, {}));
      const result = learner.extractTitlePattern(
        "Fix bug for Story-123",
        "unrelated",
      );
      // biome-ignore lint/suspicious/noTemplateCurlyInString: testing template variable replacement
      expect(result).toContain("${story.id}");
    });

    test("should handle titles without story references", () => {
      const learner = new StoryLearner(createMockPlatform({}, {}));
      const result = learner.extractTitlePattern(
        "Write unit tests",
        "Completely Different",
      );
      expect(result).toBe("Write unit tests");
    });
  });

  describe("detectActivity", () => {
    test("should detect Design activity", () => {
      const learner = new StoryLearner(createMockPlatform({}, {}));
      expect(learner.detectActivity("Design the API")).toBe("Design");
    });

    test("should detect Testing activity", () => {
      const learner = new StoryLearner(createMockPlatform({}, {}));
      expect(learner.detectActivity("Write QA tests")).toBe("Testing");
    });

    test("should detect Deployment activity", () => {
      const learner = new StoryLearner(createMockPlatform({}, {}));
      expect(learner.detectActivity("Deploy to production")).toBe("Deployment");
    });

    test("should detect Documentation activity", () => {
      const learner = new StoryLearner(createMockPlatform({}, {}));
      expect(learner.detectActivity("Update wiki page")).toBe("Documentation");
    });

    test("should default to Development", () => {
      const learner = new StoryLearner(createMockPlatform({}, {}));
      expect(learner.detectActivity("Implement feature")).toBe("Development");
    });
  });
});
