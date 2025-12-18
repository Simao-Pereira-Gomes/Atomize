import { describe, expect, test, beforeEach } from "bun:test";
import { Atomizer } from "@core/atomizer";
import { MockPlatformAdapter } from "@platforms/adapters/mock/mock.adapter";
import type { TaskTemplate } from "@templates/schema";
import { inspect } from "node:util";

describe("Atomizer", () => {
  let platform: MockPlatformAdapter;
  let atomizer: Atomizer;

  beforeEach(() => {
    platform = new MockPlatformAdapter();
    atomizer = new Atomizer(platform);
  });

  const basicTemplate: TaskTemplate = {
    version: "1.0",
    name: "Test Template",
    filter: {
      workItemTypes: ["User Story"],
      states: ["New"],
      tags: {
        include: ["backend"],
      },
      excludeIfHasTasks: true,
    },
    tasks: [
      {
        id: "task1",
        title: "Design",
        estimationPercent: 20,
      },
      {
        id: "task2",
        title: "Implement",
        estimationPercent: 50,
      },
      {
        id: "task3",
        title: "Test",
        estimationPercent: 30,
      },
    ],
  };

  describe("atomize", () => {
    test("should process stories end-to-end", async () => {
      await platform.authenticate();

      const report = await atomizer.atomize(basicTemplate, { dryRun: false });

      expect(report.templateName).toBe("Test Template");
      expect(report.storiesProcessed).toBeGreaterThan(0);
      expect(report.tasksCalculated).toBeGreaterThan(0);
      expect(report.tasksCreated).toBeGreaterThan(0);
    });

    test("should filter stories correctly", async () => {
      await platform.authenticate();

      const report = await atomizer.atomize(basicTemplate);

      // Should only find backend stories in "New" state without existing tasks
      // Based on mock data, this should be 3 stories (STORY-001, STORY-003, STORY-005)
      expect(report.storiesProcessed).toBe(3);
    });

    test("should calculate correct number of tasks", async () => {
      await platform.authenticate();

      const report = await atomizer.atomize(basicTemplate);

      // 3 stories * 3 tasks each = 9 tasks
      expect(report.tasksCalculated).toBe(9);
    });

    test("should create tasks in live mode", async () => {
      await platform.authenticate();

      const report = await atomizer.atomize(basicTemplate, { dryRun: false });

      expect(report.dryRun).toBe(false);
      expect(report.tasksCreated).toBe(report.tasksCalculated);
    });

    test("should not create tasks in dry-run mode", async () => {
      await platform.authenticate();

      const report = await atomizer.atomize(basicTemplate, { dryRun: true });

      expect(report.dryRun).toBe(true);
      expect(report.tasksCreated).toBe(0);
      expect(report.tasksCalculated).toBeGreaterThan(0);
    });

    test("should handle stories with different estimations", async () => {
      await platform.authenticate();

      const report = await atomizer.atomize(basicTemplate, { dryRun: false });

      // Check that different stories got different task estimations
      const results = report.results.filter((r) => r.success);
      expect(results.length).toBeGreaterThan(0);

      // Each story should have estimation summary
      results.forEach((result) => {
        expect(result.estimationSummary).toBeDefined();
        expect(result.estimationSummary?.storyEstimation).toBeGreaterThan(0);
      });
    });

    test("should include success and failure counts", async () => {
      await platform.authenticate();

      const report = await atomizer.atomize(basicTemplate);

      expect(report.storiesSuccess).toBeDefined();
      expect(report.storiesFailed).toBeDefined();
      expect(report.storiesSuccess + report.storiesFailed).toBe(
        report.storiesProcessed
      );
    });

    test("should include execution time", async () => {
      await platform.authenticate();

      const report = await atomizer.atomize(basicTemplate);

      expect(report.executionTime).toBeGreaterThan(0);
      expect(typeof report.executionTime).toBe("number");
    });

    test("should handle empty results (no matching stories)", async () => {
      await platform.authenticate();

      const noMatchTemplate: TaskTemplate = {
        ...basicTemplate,
        filter: {
          states: ["DoesNotExist"],
        },
      };

      const report = await atomizer.atomize(noMatchTemplate);

      expect(report.storiesProcessed).toBe(0);
      expect(report.tasksCalculated).toBe(0);
      expect(report.tasksCreated).toBe(0);
    });

    test("should continue on error when continueOnError is true", async () => {
      await platform.authenticate();

      // Create a template that will cause some tasks to fail (if we had error scenarios)
      const report = await atomizer.atomize(basicTemplate, {
        continueOnError: true,
      });

      // Should process all stories even if some fail
      expect(report.storiesProcessed).toBeGreaterThan(0);
    });

    test("should include warnings in report", async () => {
      await platform.authenticate();

      const report = await atomizer.atomize(basicTemplate);

      expect(report.warnings).toBeDefined();
      expect(Array.isArray(report.warnings)).toBe(true);
    });

    test("should include errors in report", async () => {
      await platform.authenticate();

      const report = await atomizer.atomize(basicTemplate);

      expect(report.errors).toBeDefined();
      expect(Array.isArray(report.errors)).toBe(true);
    });

    test("should include detailed results for each story", async () => {
      await platform.authenticate();

      const report = await atomizer.atomize(basicTemplate);

      expect(report.results.length).toBe(report.storiesProcessed);

      report.results.forEach((result) => {
        expect(result.story).toBeDefined();
        expect(result.tasksCalculated).toBeDefined();
        expect(result.tasksCreated).toBeDefined();
        expect(result.success).toBeDefined();
      });
    });

    test("should throw error for invalid filter", async () => {
      await platform.authenticate();

      const invalidTemplate: TaskTemplate = {
        ...basicTemplate,
        filter: {}, // Empty filter (invalid)
      };

      await expect(atomizer.atomize(invalidTemplate)).rejects.toThrow(
        "Invalid filter"
      );
    });
  });

  describe("preview", () => {
    test("should run in dry-run mode", async () => {
      await platform.authenticate();

      const report = await atomizer.preview(basicTemplate);

      expect(report.dryRun).toBe(true);
      expect(report.tasksCreated).toBe(0);
      expect(report.tasksCalculated).toBeGreaterThan(0);
    });

    test("should return same structure as atomize", async () => {
      await platform.authenticate();

      const preview = await atomizer.preview(basicTemplate);
      const actual = await atomizer.atomize(basicTemplate, { dryRun: true });

      expect(preview.templateName).toBe(actual.templateName);
      expect(preview.storiesProcessed).toBe(actual.storiesProcessed);
      expect(preview.tasksCalculated).toBe(actual.tasksCalculated);
    });
  });

  describe("countMatchingStories", () => {
    test("should count stories that match filter", async () => {
      await platform.authenticate();

      const count = await atomizer.countMatchingStories(basicTemplate);

      expect(count).toBeGreaterThan(0);
      expect(typeof count).toBe("number");
    });

    test("should return same count as atomize processes", async () => {
      await platform.authenticate();

      const count = await atomizer.countMatchingStories(basicTemplate);
      const report = await atomizer.atomize(basicTemplate);

      expect(count).toBe(report.storiesProcessed);
    });

    test("should return 0 for no matches", async () => {
      await platform.authenticate();

      const noMatchTemplate: TaskTemplate = {
        ...basicTemplate,
        filter: {
          states: ["NonExistent"],
        },
      };

      const count = await atomizer.countMatchingStories(noMatchTemplate);

      expect(count).toBe(0);
    });
  });

  describe("integration with real template", () => {
    test("should work with backend-api template structure", async () => {
      await platform.authenticate();

      const backendTemplate: TaskTemplate = {
        version: "1.0",
        name: "Backend API",
        filter: {
          workItemTypes: ["User Story"],
          states: ["New"],
          tags: {
            include: ["backend"],
          },
        },
        tasks: [
          { title: "Design API", estimationPercent: 10 },
          { title: "Implement", estimationPercent: 40 },
          { title: "Tests", estimationPercent: 30 },
          { title: "Documentation", estimationPercent: 10 },
          { title: "Code Review", estimationPercent: 10 },
        ],
        estimation: { strategy: "percentage", rounding: "none" },
      };

      const report = await atomizer.atomize(backendTemplate);

      expect(report.storiesProcessed).toBeGreaterThan(0);
      inspect;
      expect(report.tasksCalculated).toBeGreaterThan(5);

      // Check estimation adds up to 100%
      report.results.forEach((result) => {
        if (result.success && result.estimationSummary) {
          const percentUsed = result.estimationSummary.percentageUsed;
          expect(percentUsed).toBeGreaterThan(95);
          expect(percentUsed).toBeLessThan(105);
        }
      });
    });
  });
});
