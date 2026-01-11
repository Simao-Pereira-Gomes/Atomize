import { describe, expect, test } from "bun:test";
import { EstimationCalculator } from "@core/estimation-calculator";
import type { WorkItem } from "@platforms/interfaces/work-item.interface";
import type { EstimationConfig, TaskDefinition } from "@templates/schema";

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

      const calculated = calculator.calculateTasks(
        mockStory,
        mockStory.assignedTo ?? "",
        tasks
      );

      expect(calculated).toHaveLength(3);
      expect(calculated[0]?.estimation).toBe(3);
      expect(calculated[1]?.estimation).toBe(5);
      expect(calculated[2]?.estimation).toBe(2);
    });

    test("should use fixed estimations when provided", () => {
      const tasks: TaskDefinition[] = [
        { title: "Task 1", estimationFixed: 2 },
        { title: "Task 2", estimationFixed: 5 },
      ];

      const calculated = calculator.calculateTasks(
        mockStory,
        mockStory.assignedTo ?? "",
        tasks
      );

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
      const nearest = calculator.calculateTasks(
        story,
        mockStory.assignedTo ?? "",
        tasks,
        nearestConfig
      );
      expect(nearest[0]?.estimation).toBe(3);

      // Round up
      const upConfig: EstimationConfig = {
        strategy: "percentage",
        rounding: "up",
      };
      const up = calculator.calculateTasks(
        story,
        mockStory.assignedTo ?? "",
        tasks,
        upConfig
      );
      expect(up[0]?.estimation).toBe(4);

      // Round down
      const downConfig: EstimationConfig = {
        strategy: "percentage",
        rounding: "down",
      };
      const down = calculator.calculateTasks(
        story,
        mockStory.assignedTo ?? "",
        tasks,
        downConfig
      );
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

      const calculated = calculator.calculateTasks(
        story,
        mockStory.assignedTo ?? "",
        tasks,
        config
      );

      expect(calculated[0]?.estimation).toBe(0.5); // Minimum enforced
    });

    test("should skip conditional tasks", () => {
      const tasks: TaskDefinition[] = [
        { title: "Task 1", estimationPercent: 50 },
        {
          title: "Conditional",
          estimationPercent: 30,
          //biome-ignore lint/suspicious: The template is needed for user input
          condition: "${someCondition}",
        },
        { title: "Task 2", estimationPercent: 20 },
      ];

      const calculated = calculator.calculateTasks(
        mockStory,
        mockStory.assignedTo ?? "",
        tasks
      );

      // Should only calculate non-conditional tasks
      expect(calculated).toHaveLength(2);
      expect(calculated[0]?.title).toBe("Task 1");
      expect(calculated[1]?.title).toBe("Task 2");
    });

    test("should evaluate conditions with outer quotes from YAML", () => {
      const story = { ...mockStory, estimation: 1 };
      const tasks: TaskDefinition[] = [
        { title: "Task 1", estimationPercent: 50 },
        {
          title: "High Estimation Task",
          estimationPercent: 30,
          //biome-ignore lint/suspicious: The template is needed for user input
          condition: "'${story.estimation} >= 3'",
        },
        {
          title: "Low Estimation Task",
          estimationPercent: 20,
          //biome-ignore lint/suspicious: The template is needed for user input
          condition: '"${story.estimation} < 3"',
        },
      ];

      const calculated = calculator.calculateTasks(
        story,
        story.assignedTo ?? "",
        tasks
      );

      expect(calculated).toHaveLength(2);
      expect(calculated[0]?.title).toBe("Task 1");
      expect(calculated[1]?.title).toBe("Low Estimation Task");
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

      const calculated = calculator.calculateTasks(
        mockStory,
        mockStory.assignedTo ?? "",
        tasks
      );

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

      const calculated = calculator.calculateTasks(
        mockStory,
        mockStory.assignedTo ?? "",
        tasks
      );

      expect(calculated[0]?.assignTo).toBe("john@example.com");
    });

    test("should handle story with no estimation", () => {
      const storyNoEstimation = { ...mockStory, estimation: 0 };
      const tasks: TaskDefinition[] = [
        { title: "Task", estimationPercent: 50 },
      ];

      const calculated = calculator.calculateTasks(
        storyNoEstimation,
        storyNoEstimation.assignedTo ?? "",
        tasks
      );

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
      expect(validation.valid).toBe(true);
    });
  });

  describe("calculateTasksWithSkipped - normalization after filtering", () => {
    test("should normalize estimations when tasks are filtered out by conditions", () => {
      const storyWithTags: WorkItem = {
        ...mockStory,
        estimation: 10,
        tags: ["frontend"],
      };

      const tasks: TaskDefinition[] = [
        { title: "Task 1", estimationPercent: 20 },
        { title: "Task 2", estimationPercent: 30 },
        {
          title: "Backend Task",
          estimationPercent: 30,
          // biome-ignore lint/suspicious : We want to test the template interpolation here
          condition: '${story.tags} CONTAINS "backend"',
        },
        { title: "Task 3", estimationPercent: 20 },
      ];

      const result = calculator.calculateTasksWithSkipped(
        storyWithTags,
        storyWithTags.assignedTo ?? "",
        tasks
      );

      // Should have 3 tasks (backend task filtered out)
      expect(result.calculatedTasks).toHaveLength(3);
      expect(result.skippedTasks).toHaveLength(1);
      expect(result.skippedTasks[0]?.templateTask.title).toBe("Backend Task");

      // After normalization: should sum to 100. Initial percentages: 20 + 30 + 20 = 70
      const totalPercent = result.calculatedTasks.reduce(
        (sum, t) => sum + (t.estimationPercent || 0),
        0
      );
      expect(totalPercent).toBe(100);

      // Check proportions are maintained: 20:30:20 -> 29:43:28 (scaled from 70 to 100)
      // 20 * 100/70 = 28.57 rounds to 29, 30 * 100/70 = 42.86 rounds to 43, last gets remainder
      expect(result.calculatedTasks[0]?.estimationPercent).toBe(29);
      expect(result.calculatedTasks[1]?.estimationPercent).toBe(43);
      expect(result.calculatedTasks[2]?.estimationPercent).toBe(28);

      const totalEstimation = result.calculatedTasks.reduce(
        (sum, t) => sum + (t.estimation || 0),
        0
      );
      expect(totalEstimation).toBeCloseTo(10, 1);
    });

    test("should normalize to 100% when multiple tasks are filtered out", () => {
      const storyWithoutBackend: WorkItem = {
        ...mockStory,
        estimation: 8,
        tags: ["frontend"],
      };

      const tasks: TaskDefinition[] = [
        { title: "Frontend Task 1", estimationPercent: 30 },
        {
          title: "Backend Task 1",
          estimationPercent: 25,
          // biome-ignore lint/suspicious : We want to test the template interpolation here
          condition: '${story.tags} CONTAINS "backend"',
        },
        {
          title: "Backend Task 2",
          estimationPercent: 25,
          // biome-ignore lint/suspicious : We want to test the template interpolation here
          condition: '${story.tags} CONTAINS "backend"',
        },
        { title: "Frontend Task 2", estimationPercent: 20 },
      ];

      const result = calculator.calculateTasksWithSkipped(
        storyWithoutBackend,
        storyWithoutBackend.assignedTo ?? "",
        tasks
      );

      // Should have 2 tasks (2 backend tasks filtered out)
      expect(result.calculatedTasks).toHaveLength(2);
      expect(result.skippedTasks).toHaveLength(2);

      // After normalization: should sum to 100. Original percentages of remaining tasks: 30 + 20 = 50
      const totalPercent = result.calculatedTasks.reduce(
        (sum, t) => sum + (t.estimationPercent || 0),
        0
      );
      expect(totalPercent).toBe(100);

      // Check proportions: 30:20 -> 60:40
      expect(result.calculatedTasks[0]?.estimationPercent).toBe(60);
      expect(result.calculatedTasks[1]?.estimationPercent).toBe(40);
      expect(result.calculatedTasks[0]?.estimation).toBeCloseTo(4.8, 1);
      expect(result.calculatedTasks[1]?.estimation).toBeCloseTo(3.2, 1);
    });

    test("should not normalize if no tasks are skipped", () => {
      const story: WorkItem = {
        ...mockStory,
        estimation: 10,
      };

      const tasks: TaskDefinition[] = [
        { title: "Task 1", estimationPercent: 40 },
        { title: "Task 2", estimationPercent: 60 },
      ];

      const result = calculator.calculateTasksWithSkipped(
        story,
        story.assignedTo ?? "",
        tasks
      );

      expect(result.calculatedTasks).toHaveLength(2);
      expect(result.skippedTasks).toHaveLength(0);

      expect(result.calculatedTasks[0]?.estimationPercent).toBe(40);
      expect(result.calculatedTasks[1]?.estimationPercent).toBe(60);
    });

    test("should handle when all but one task is filtered out", () => {
      const storyWithoutBackend: WorkItem = {
        ...mockStory,
        estimation: 5,
        tags: ["frontend"],
      };

      const tasks: TaskDefinition[] = [
        { title: "Frontend Task", estimationPercent: 40 },
        {
          title: "Backend Task 1",
          estimationPercent: 30,
          // biome-ignore lint/suspicious : We want to test the template interpolation here
          condition: '${story.tags} CONTAINS "backend"',
        },
        {
          title: "Backend Task 2",
          estimationPercent: 30,
          // biome-ignore lint/suspicious : We want to test the template interpolation here
          condition: '${story.tags} CONTAINS "backend"',
        },
      ];

      const result = calculator.calculateTasksWithSkipped(
        storyWithoutBackend,
        storyWithoutBackend.assignedTo ?? "",
        tasks
      );

      expect(result.calculatedTasks).toHaveLength(1);
      expect(result.skippedTasks).toHaveLength(2);
      expect(result.calculatedTasks[0]?.estimationPercent).toBe(100);
      expect(result.calculatedTasks[0]?.estimation).toBe(5);
    });

    test("should distribute equally if remaining tasks have zero estimation", () => {
      const story: WorkItem = {
        ...mockStory,
        estimation: 9,
        tags: ["test"],
      };

      const tasks: TaskDefinition[] = [
        { title: "Task 1", estimationPercent: 0 },
        { title: "Task 2", estimationPercent: 0 },
        {
          title: "Backend Task",
          estimationPercent: 100,
          // biome-ignore lint/suspicious : We want to test the template interpolation here
          condition: '${story.tags} CONTAINS "backend"',
        },
      ];

      const result = calculator.calculateTasksWithSkipped(
        story,
        story.assignedTo ?? "",
        tasks
      );

      expect(result.calculatedTasks).toHaveLength(2);
      expect(result.skippedTasks).toHaveLength(1);

      const totalPercent = result.calculatedTasks.reduce(
        (sum, t) => sum + (t.estimationPercent || 0),
        0
      );
      expect(totalPercent).toBe(100);
      expect(result.calculatedTasks[0]?.estimationPercent).toBe(50);
      expect(result.calculatedTasks[1]?.estimationPercent).toBe(50);
    });

    test("should handle complex condition scenarios with proper normalization", () => {
      const story: WorkItem = {
        ...mockStory,
        estimation: 13,
        tags: ["frontend", "api"],
        customFields: {
          component: "web-app",
        },
      };

      const tasks: TaskDefinition[] = [
        { title: "UI Task", estimationPercent: 25 },
        {
          title: "Database Task",
          estimationPercent: 20,
          // biome-ignore lint/suspicious : We want to test the template interpolation here
          condition: '${story.customFields.component} == "api"',
        },
        { title: "API Task", estimationPercent: 30 },
        {
          title: "Mobile Task",
          estimationPercent: 15,
          // biome-ignore lint/suspicious : We want to test the template interpolation here
          condition: '${story.tags} CONTAINS "mobile"',
        },
        { title: "Testing Task", estimationPercent: 10 },
      ];

      const result = calculator.calculateTasksWithSkipped(
        story,
        story.assignedTo ?? "",
        tasks
      );

      expect(result.calculatedTasks).toHaveLength(3);
      expect(result.skippedTasks).toHaveLength(2);

      const totalPercent = result.calculatedTasks.reduce(
        (sum, t) => sum + (t.estimationPercent || 0),
        0
      );
      expect(totalPercent).toBe(100);

      const totalEstimation = result.calculatedTasks.reduce(
        (sum, t) => sum + (t.estimation || 0),
        0
      );
      expect(totalEstimation).toBeCloseTo(13, 0);
    });
  });
});
