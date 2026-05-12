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

  describe("calculateTasksWithSkipped", () => {
    test("should calculate percentage-based estimations", () => {
      const tasks: TaskDefinition[] = [
        { title: "Task 1", estimationPercent: 30 },
        { title: "Task 2", estimationPercent: 50 },
        { title: "Task 3", estimationPercent: 20 },
      ];

      const { calculatedTasks: calculated } = calculator.calculateTasksWithSkipped(
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

      const { calculatedTasks: calculated } = calculator.calculateTasksWithSkipped(
        mockStory,
        mockStory.assignedTo ?? "",
        tasks
      );

      expect(calculated[0]?.estimation).toBe(2);
      expect(calculated[1]?.estimation).toBe(5);
    });

    test("should round estimations according to strategy (half-point precision)", () => {
      const story = { ...mockStory, estimation: 10 };
      const tasks: TaskDefinition[] = [
        { title: "Task", estimationPercent: 33 }, // 3.3
        { title: "Filler", estimationPercent: 67 },
      ];

      // Nearest (rounds to nearest 0.5)
      const nearestConfig: EstimationConfig = {
        strategy: "percentage",
        rounding: "nearest",
      };
      const { calculatedTasks: nearest } = calculator.calculateTasksWithSkipped(
        story,
        mockStory.assignedTo ?? "",
        tasks,
        nearestConfig
      );
      expect(nearest[0]?.estimation).toBe(3.5); // 3.3 rounds to 3.5

      // Round up (rounds up to nearest 0.5)
      const upConfig: EstimationConfig = {
        strategy: "percentage",
        rounding: "up",
      };
      const { calculatedTasks: up } = calculator.calculateTasksWithSkipped(
        story,
        mockStory.assignedTo ?? "",
        tasks,
        upConfig
      );
      expect(up[0]?.estimation).toBe(3.5); // 3.3 rounds up to 3.5

      // Round down (rounds down to nearest 0.5)
      const downConfig: EstimationConfig = {
        strategy: "percentage",
        rounding: "down",
      };
      const { calculatedTasks: down } = calculator.calculateTasksWithSkipped(
        story,
        mockStory.assignedTo ?? "",
        tasks,
        downConfig
      );
      expect(down[0]?.estimation).toBe(3); // 3.3 rounds down to 3.0
    });

    test("should preserve small percentage values with half-point rounding", () => {
      // This test verifies the fix for the issue where small percentages
      // resulted in 0 estimation (e.g., 2 story points * 5% = 0.1 -> 0)
      const story = { ...mockStory, estimation: 2 };
      const tasks: TaskDefinition[] = [
        { title: "Wiki Task", estimationPercent: 5 }, // 2 * 0.05 = 0.1
        { title: "Filler", estimationPercent: 95 },
      ];

      const config: EstimationConfig = {
        strategy: "percentage",
        rounding: "nearest",
      };
      const { calculatedTasks: calculated } = calculator.calculateTasksWithSkipped(
        story,
        mockStory.assignedTo ?? "",
        tasks,
        config
      );
      // 0.1 should round to 0 with half-point precision, but minimum should apply if set
      // Without minimum, 0.1 rounds to 0 (nearest 0.5)
      expect(calculated[0]?.estimation).toBe(0);

      // With a minimum of 0.5, small values should be at least 0.5
      const configWithMin: EstimationConfig = {
        strategy: "percentage",
        rounding: "nearest",
        minimumTaskPoints: 0.5,
      };
      const { calculatedTasks: calculatedWithMin } = calculator.calculateTasksWithSkipped(
        story,
        mockStory.assignedTo ?? "",
        tasks,
        configWithMin
      );
      expect(calculatedWithMin[0]?.estimation).toBe(0.5);
    });

    test("should apply minimum task points", () => {
      const story = { ...mockStory, estimation: 10 };
      const tasks: TaskDefinition[] = [
        { title: "Small Task", estimationPercent: 3 }, // 0.3 points
        { title: "Filler", estimationPercent: 97 },
      ];

      const config: EstimationConfig = {
        strategy: "percentage",
        minimumTaskPoints: 0.5,
        ifParentHasNoEstimation: "use-default",
        defaultParentEstimation: 10,
        rounding: "nearest",
      };

      const { calculatedTasks: calculated } = calculator.calculateTasksWithSkipped(
        story,
        mockStory.assignedTo ?? "",
        tasks,
        config
      );

      expect(calculated[0]?.estimation).toBe(0.5); // Minimum enforced
    });

    test("should skip conditional tasks when condition not met", () => {
      const tasks: TaskDefinition[] = [
        { title: "Task 1", estimationPercent: 50 },
        {
          title: "Conditional",
          estimationPercent: 30,
          condition: { field: "tags", operator: "contains", value: "frontend" },
        },
        { title: "Task 2", estimationPercent: 20 },
      ];

      const { calculatedTasks: calculated } = calculator.calculateTasksWithSkipped(
        mockStory,
        mockStory.assignedTo ?? "",
        tasks
      );

      // Should only calculate non-conditional tasks (story has no "frontend" tag)
      expect(calculated).toHaveLength(2);
      expect(calculated[0]?.title).toBe("Task 1");
      expect(calculated[1]?.title).toBe("Task 2");
    });

    test("should include conditional tasks when condition is met", () => {
      const story = { ...mockStory, estimation: 1 };
      const tasks: TaskDefinition[] = [
        { title: "Task 1", estimationPercent: 50 },
        {
          title: "High Estimation Task",
          estimationPercent: 30,
          condition: { field: "estimation", operator: "gte", value: 3 },
        },
        {
          title: "Low Estimation Task",
          estimationPercent: 20,
          condition: { field: "estimation", operator: "lt", value: 3 },
        },
      ];

      const { calculatedTasks: calculated } = calculator.calculateTasksWithSkipped(
        story,
        story.assignedTo ?? "",
        tasks
      );

      // story.estimation = 1, so only "Low Estimation Task" condition passes
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

      const { calculatedTasks: calculated } = calculator.calculateTasksWithSkipped(
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

    test("should set completedWork to 0 and inherit iteration from parent", () => {
      const storyWithIteration: WorkItem = {
        ...mockStory,
        iteration: "Project\\Sprint 1",
      };

      const tasks: TaskDefinition[] = [
        {
          title: "Test Task",
          estimationPercent: 100,
        },
      ];

      const { calculatedTasks: calculated } = calculator.calculateTasksWithSkipped(
        storyWithIteration,
        storyWithIteration.assignedTo ?? "",
        tasks
      );

      expect(calculated[0]?.completedWork).toBe(0);
      expect(calculated[0]?.iteration).toBe("Project\\Sprint 1");
    });

    test("should resolve @ParentAssignee assignment", () => {
      const tasks: TaskDefinition[] = [
        { title: "Task", estimationPercent: 100, assignTo: "@ParentAssignee" },
      ];

      const { calculatedTasks: calculated } = calculator.calculateTasksWithSkipped(
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

      const { calculatedTasks: calculated } = calculator.calculateTasksWithSkipped(
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
          condition: { field: "tags", operator: "contains", value: "backend" },
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
          condition: { field: "tags", operator: "contains", value: "backend" },
        },
        {
          title: "Backend Task 2",
          estimationPercent: 25,
          condition: { field: "tags", operator: "contains", value: "backend" },
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
          condition: { field: "tags", operator: "contains", value: "backend" },
        },
        {
          title: "Backend Task 2",
          estimationPercent: 30,
          condition: { field: "tags", operator: "contains", value: "backend" },
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
          condition: { field: "tags", operator: "contains", value: "backend" },
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
          condition: { field: "customFields.component", operator: "equals", value: "api" },
        },
        { title: "API Task", estimationPercent: 30 },
        {
          title: "Mobile Task",
          estimationPercent: 15,
          condition: { field: "tags", operator: "contains", value: "mobile" },
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

  describe("estimationPercentCondition", () => {
    test("should use the first matching condition's percent", () => {
      const story = { ...mockStory, estimation: 10 };
      const tasks: TaskDefinition[] = [
        {
          title: "Task",
          estimationPercent: 40,
          estimationPercentCondition: [
            { condition: { field: "estimation", operator: "gte", value: 8 }, percent: 60 },
          ],
        },
        { title: "Filler", estimationPercent: 40 },
      ];

      const { calculatedTasks: calculated } = calculator.calculateTasksWithSkipped(story, "", tasks);

      expect(calculated[0]?.estimationPercent).toBe(60);
      expect(calculated[0]?.estimation).toBe(6); // 60% of 10
    });

    test("should fall back to estimationPercent when no condition matches", () => {
      const story = { ...mockStory, estimation: 10 };
      const tasks: TaskDefinition[] = [
        {
          title: "Task",
          estimationPercent: 40,
          estimationPercentCondition: [
            { condition: { field: "estimation", operator: "gte", value: 50 }, percent: 80 },
          ],
        },
        { title: "Filler", estimationPercent: 60 },
      ];

      const { calculatedTasks: calculated } = calculator.calculateTasksWithSkipped(story, "", tasks);

      expect(calculated[0]?.estimationPercent).toBe(40);
      expect(calculated[0]?.estimation).toBe(4); // 40% of 10
    });

    test("should evaluate rules in order and use the first match", () => {
      const tasks: TaskDefinition[] = [
        {
          title: "Design",
          estimationPercent: 10,
          estimationPercentCondition: [
            { condition: { field: "estimation", operator: "gte", value: 13 }, percent: 20 },
            { condition: { field: "estimation", operator: "gte", value: 5 }, percent: 15 },
          ],
        },
        { title: "Filler", estimationPercent: 90 },
      ];

      const { calculatedTasks: small } = calculator.calculateTasksWithSkipped(
        { ...mockStory, estimation: 3 },
        "",
        tasks,
      );
      const { calculatedTasks: medium } = calculator.calculateTasksWithSkipped(
        { ...mockStory, estimation: 8 },
        "",
        tasks,
      );
      const { calculatedTasks: large } = calculator.calculateTasksWithSkipped(
        { ...mockStory, estimation: 13 },
        "",
        tasks,
      );

      expect(small[0]?.estimationPercent).toBe(10); // no match → fallback
      expect(medium[0]?.estimationPercent).toBe(15); // second rule matches
      expect(large[0]?.estimationPercent).toBe(20); // first rule matches
    });

    test("should support tag-based conditions", () => {
      const tasks: TaskDefinition[] = [
        {
          title: "Backend",
          estimationPercent: 60,
          estimationPercentCondition: [
            {
              condition: { field: "tags", operator: "contains", value: "fullstack" },
              percent: 40,
            },
          ],
        },
        { title: "Filler", estimationPercent: 60 },
      ];

      const { calculatedTasks: backendOnly } = calculator.calculateTasksWithSkipped(
        { ...mockStory, estimation: 10, tags: ["backend"] },
        "",
        tasks,
      );
      const { calculatedTasks: fullstack } = calculator.calculateTasksWithSkipped(
        { ...mockStory, estimation: 10, tags: ["fullstack"] },
        "",
        tasks,
      );

      expect(backendOnly[0]?.estimationPercent).toBe(60); // no match → fallback
      expect(fullstack[0]?.estimationPercent).toBe(40); // condition met
    });

    test("should resolve conditional percents before normalization in calculateTasksWithSkipped", () => {
      // Task A and C resolve to 30% and 70% → sum=100, normalization skipped.
      const story: WorkItem = { ...mockStory, estimation: 10, tags: ["backend"] };
      const tasks: TaskDefinition[] = [
        {
          title: "Task A",
          estimationPercent: 20,
          estimationPercentCondition: [
            { condition: { field: "estimation", operator: "gte", value: 5 }, percent: 30 },
          ],
        },
        {
          title: "Skipped Task",
          estimationPercent: 50,
          condition: { field: "tags", operator: "contains", value: "frontend" },
        },
        {
          title: "Task C",
          estimationPercent: 30,
          estimationPercentCondition: [
            { condition: { field: "estimation", operator: "gte", value: 5 }, percent: 70 },
          ],
        },
      ];

      const result = calculator.calculateTasksWithSkipped(story, "", tasks);

      expect(result.calculatedTasks).toHaveLength(2);
      expect(result.skippedTasks).toHaveLength(1);

      // Resolved: A=30%, C=70% → total=100, normalization skipped
      expect(result.calculatedTasks[0]?.estimationPercent).toBe(30);
      expect(result.calculatedTasks[1]?.estimationPercent).toBe(70);
      expect(result.calculatedTasks[0]?.estimation).toBe(3); // 30% of 10
      expect(result.calculatedTasks[1]?.estimation).toBe(7); // 70% of 10
    });

    test("should normalize resolved conditional percents when they sum below 100", () => {
      // Design resolves to 20%, Frontend resolves to 50% → total=70 → normalised.
      const story: WorkItem = { ...mockStory, estimation: 10, tags: ["frontend"] };
      const tasks: TaskDefinition[] = [
        {
          title: "Design",
          estimationPercent: 10,
          estimationPercentCondition: [
            { condition: { field: "estimation", operator: "gte", value: 5 }, percent: 20 },
          ],
        },
        {
          title: "Backend",
          estimationPercent: 60,
          condition: { field: "tags", operator: "contains", value: "backend" },
        },
        {
          title: "Frontend",
          estimationPercent: 30,
          estimationPercentCondition: [
            { condition: { field: "estimation", operator: "gte", value: 5 }, percent: 50 },
          ],
        },
      ];

      const result = calculator.calculateTasksWithSkipped(story, "", tasks);

      expect(result.calculatedTasks).toHaveLength(2);
      expect(result.skippedTasks).toHaveLength(1);

      // Resolved: Design=20%, Frontend=50% → total=70
      // scaleToHundred: Design=round(20*100/70)=29, Frontend=100-29=71
      const totalPercent = result.calculatedTasks.reduce(
        (sum, t) => sum + (t.estimationPercent ?? 0),
        0,
      );
      expect(totalPercent).toBe(100);
      expect(result.calculatedTasks[0]?.estimationPercent).toBe(29);
      expect(result.calculatedTasks[1]?.estimationPercent).toBe(71);

      const totalEstimation = result.calculatedTasks.reduce(
        (sum, t) => sum + (t.estimation ?? 0),
        0,
      );
      expect(totalEstimation).toBeCloseTo(10, 1);
    });
  });
});
