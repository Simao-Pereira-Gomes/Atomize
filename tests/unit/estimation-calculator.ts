import { describe, expect, test } from "bun:test";
import { EstimationCalculator } from "@core/estimation-calculator";
import type { WorkItem } from "@platforms/interfaces/work-item.interface";
import type { TaskDefinition, EstimationConfig } from "@templates/schema";

describe("EstimationCalculator", () => {
  const calculator = new EstimationCalculator();

  const mockStory: WorkItem = {
    id: "STORY-001",
    title: "Test Story",
    type: "User Story",
    state: "New",
    estimation: 10,
    assignedTo: "john@example.com",
  };

  describe("calculateTasks", () => {
    test("should calculate percentage-based estimations", () => {
      const tasks: TaskDefinition[] = [
        { title: "Task 1", estimationPercent: 30 },
        { title: "Task 2", estimationPercent: 50 },
        { title: "Task 3", estimationPercent: 20 },
      ];

      const calculated = calculator.calculateTasks(mockStory, tasks);

      expect(calculated).toHaveLength(3);
      expect(calculated[0]?.estimation).toBe(3); // 10 * 30% = 3
      expect(calculated[1]?.estimation).toBe(5); // 10 * 50% = 5
      expect(calculated[2]?.estimation).toBe(2); // 10 * 20% = 2
    });

    test("should use fixed estimations when provided", () => {
      const tasks: TaskDefinition[] = [
        { title: "Task 1", estimationFixed: 2 },
        { title: "Task 2", estimationFixed: 5 },
      ];

      const calculated = calculator.calculateTasks(mockStory, tasks);

      expect(calculated[0]?.estimation).toBe(2);
      expect(calculated[1]?.estimation).toBe(5);
    });

    test("should round estimations according to strategy", () => {
      const story = { ...mockStory, estimation: 10 };
      const tasks: TaskDefinition[] = [
        { title: "Task", estimationPercent: 33 }, // 3.3
      ];

      // Nearest (default)
      const nearestConfig: EstimationConfig = {
        strategy: "percentage",
        rounding: "nearest",
      };
      const nearest = calculator.calculateTasks(story, tasks, nearestConfig);
      expect(nearest[0]?.estimation).toBe(3);

      // Round up
      const upConfig: EstimationConfig = {
        strategy: "percentage",
        rounding: "up",
      };
      const up = calculator.calculateTasks(story, tasks, upConfig);
      expect(up[0]?.estimation).toBe(4);

      // Round down
      const downConfig: EstimationConfig = {
        strategy: "percentage",
        rounding: "down",
      };
      const down = calculator.calculateTasks(story, tasks, downConfig);
      expect(down[0]?.estimation).toBe(3);
    });

    test("should apply minimum task points", () => {
      const story = { ...mockStory, estimation: 10 };
      const tasks: TaskDefinition[] = [
        { title: "Small Task", estimationPercent: 3 }, // 0.3 points
      ];

      const config: EstimationConfig = {
        strategy: "percentage",
        minimumTaskPoints: 0.5,
        ifParentHasNoEstimation: "use-default",
        defaultParentEstimation: 10,
        rounding: "nearest",
      };

      const calculated = calculator.calculateTasks(story, tasks, config);

      expect(calculated[0]?.estimation).toBe(0.5); // Minimum enforced
    });

    test("should skip conditional tasks", () => {
      const tasks: TaskDefinition[] = [
        { title: "Task 1", estimationPercent: 50 },
        {
          title: "Conditional",
          estimationPercent: 30,
          condition: "${someCondition}",
        },
        { title: "Task 2", estimationPercent: 20 },
      ];

      const calculated = calculator.calculateTasks(mockStory, tasks);

      // Should only calculate non-conditional tasks
      expect(calculated).toHaveLength(2);
      expect(calculated[0]?.title).toBe("Task 1");
      expect(calculated[1]?.title).toBe("Task 2");
    });

    test("should copy task properties correctly", () => {
      const tasks: TaskDefinition[] = [
        {
          title: "Test Task",
          description: "Description",
          estimationPercent: 50,
          tags: ["test", "dev"],
          priority: 1,
          activity: "Development",
        },
      ];

      const calculated = calculator.calculateTasks(mockStory, tasks);

      expect(calculated[0]?.title).toBe("Test Task");
      expect(calculated[0]?.description).toBe("Description");
      expect(calculated[0]?.tags).toEqual(["test", "dev"]);
      expect(calculated[0]?.priority).toBe(1);
      expect(calculated[0]?.activity).toBe("Development");
    });

    test("should resolve @ParentAssignee assignment", () => {
      const tasks: TaskDefinition[] = [
        { title: "Task", estimationPercent: 100, assignTo: "@ParentAssignee" },
      ];

      const calculated = calculator.calculateTasks(mockStory, tasks);

      expect(calculated[0]?.assignTo).toBe("john@example.com");
    });

    test("should handle story with no estimation", () => {
      const storyNoEstimation = { ...mockStory, estimation: 0 };
      const tasks: TaskDefinition[] = [
        { title: "Task", estimationPercent: 50 },
      ];

      const calculated = calculator.calculateTasks(storyNoEstimation, tasks);

      expect(calculated[0]?.estimation).toBe(0);
    });
  });

  describe("calculateTotalEstimation", () => {
    test("should sum task estimations", () => {
      const tasks = [
        { title: "T1", estimation: 3 },
        { title: "T2", estimation: 5 },
        { title: "T3", estimation: 2 },
      ];

      const total = calculator.calculateTotalEstimation(tasks);

      expect(total).toBe(10);
    });

    test("should handle tasks with no estimation", () => {
      const tasks = [
        { title: "T1", estimation: 3 },
        { title: "T2" }, // No estimation
      ];

      const total = calculator.calculateTotalEstimation(tasks);

      expect(total).toBe(3);
    });
  });

  describe("getEstimationSummary", () => {
    test("should provide accurate summary", () => {
      const story = { ...mockStory, estimation: 10 };
      const tasks = [
        { title: "T1", estimation: 3 },
        { title: "T2", estimation: 5 },
        { title: "T3", estimation: 2 },
      ];

      const summary = calculator.getEstimationSummary(story, tasks);

      expect(summary.storyEstimation).toBe(10);
      expect(summary.totalTaskEstimation).toBe(10);
      expect(summary.difference).toBe(0);
      expect(summary.percentageUsed).toBe(100);
    });

    test("should calculate difference correctly", () => {
      const story = { ...mockStory, estimation: 10 };
      const tasks = [
        { title: "T1", estimation: 3 },
        { title: "T2", estimation: 4 },
      ];

      const summary = calculator.getEstimationSummary(story, tasks);

      expect(summary.totalTaskEstimation).toBe(7);
      expect(summary.difference).toBe(3);
      expect(summary.percentageUsed).toBe(70);
    });

    test("should handle story with no estimation", () => {
      const story = { ...mockStory, estimation: 0 };
      const tasks = [{ title: "T1", estimation: 3 }];

      const summary = calculator.getEstimationSummary(story, tasks);

      expect(summary.percentageUsed).toBe(0);
    });
  });

  describe("validateEstimation", () => {
    test("should pass validation when estimations match", () => {
      const story = { ...mockStory, estimation: 10 };
      const tasks = [
        { title: "T1", estimation: 5 },
        { title: "T2", estimation: 5 },
      ];

      const validation = calculator.validateEstimation(story, tasks);

      expect(validation.valid).toBe(true);
      expect(validation.warnings).toHaveLength(0);
    });

    test("should warn when estimations do not match", () => {
      const story = { ...mockStory, estimation: 10 };
      const tasks = [
        { title: "T1", estimation: 3 },
        { title: "T2", estimation: 4 },
      ];

      const validation = calculator.validateEstimation(story, tasks);

      expect(validation.valid).toBe(false);
      expect(validation.warnings.length).toBeGreaterThan(0);
      expect(validation.warnings[0]).toContain("differs");
    });

    test("should warn about zero estimations", () => {
      const story = { ...mockStory, estimation: 10 };
      const tasks = [
        { title: "T1", estimation: 10 },
        { title: "T2", estimation: 0 },
      ];

      const validation = calculator.validateEstimation(story, tasks);

      expect(validation.valid).toBe(false);
      expect(
        validation.warnings.some((w) => w.includes("zero estimation"))
      ).toBe(true);
    });

    test("should allow small differences (tolerance)", () => {
      const story = { ...mockStory, estimation: 10 };
      const tasks = [
        { title: "T1", estimation: 5.2 },
        { title: "T2", estimation: 4.9 },
      ];

      const validation = calculator.validateEstimation(story, tasks);

      // 10.1 vs 10 = 0.1 difference, within 0.5 tolerance
      expect(validation.valid).toBe(true);
    });
  });
});
