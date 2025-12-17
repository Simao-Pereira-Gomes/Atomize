import { describe, expect, test } from "bun:test";
import {
  FilterCriteriaSchema,
  TaskDefinitionSchema,
  EstimationConfigSchema,
  ValidationConfigSchema,
  TaskTemplateSchema,
} from "@templates/schema";

describe("Schema Validation", () => {
  describe("FilterCriteriaSchema", () => {
    test("should accept valid filter criteria", () => {
      const filter = {
        workItemTypes: ["User Story"],
        states: ["New", "Active"],
        tags: {
          include: ["backend"],
          exclude: ["deprecated"],
        },
      };

      const result = FilterCriteriaSchema.safeParse(filter);
      expect(result.success).toBe(true);
    });

    test("should accept minimal filter criteria", () => {
      const filter = {};

      const result = FilterCriteriaSchema.safeParse(filter);
      expect(result.success).toBe(true);
    });

    test("should accept custom fields", () => {
      const filter = {
        customFields: [
          {
            field: "Custom.Team",
            operator: "equals",
            value: "Platform",
          },
        ],
      };

      const result = FilterCriteriaSchema.safeParse(filter);
      expect(result.success).toBe(true);
    });

    test("should reject invalid operator", () => {
      const filter = {
        customFields: [
          {
            field: "Custom.Team",
            operator: "invalid",
            value: "Platform",
          },
        ],
      };

      const result = FilterCriteriaSchema.safeParse(filter);
      expect(result.success).toBe(false);
    });
  });

  describe("TaskDefinitionSchema", () => {
    test("should accept valid task", () => {
      const task = {
        id: "task1",
        title: "My Task",
        description: "Task description",
        estimationPercent: 50,
        tags: ["dev"],
      };

      const result = TaskDefinitionSchema.safeParse(task);
      expect(result.success).toBe(true);
    });

    test("should require title", () => {
      const task = {
        estimationPercent: 50,
      };

      const result = TaskDefinitionSchema.safeParse(task);
      expect(result.success).toBe(false);
    });

    test("should reject empty title", () => {
      const task = {
        title: "",
        estimationPercent: 50,
      };

      const result = TaskDefinitionSchema.safeParse(task);
      expect(result.success).toBe(false);
    });

    test("should accept task with dependencies", () => {
      const task = {
        title: "Task 2",
        estimationPercent: 50,
        dependsOn: ["task1"],
      };

      const result = TaskDefinitionSchema.safeParse(task);
      expect(result.success).toBe(true);
    });

    test("should reject negative estimation", () => {
      const task = {
        title: "Task",
        estimationPercent: -10,
      };

      const result = TaskDefinitionSchema.safeParse(task);
      expect(result.success).toBe(false);
    });

    test("should reject estimation > 100", () => {
      const task = {
        title: "Task",
        estimationPercent: 150,
      };

      const result = TaskDefinitionSchema.safeParse(task);
      expect(result.success).toBe(false);
    });

    test("should accept acceptance criteria", () => {
      const task = {
        title: "Task",
        estimationPercent: 50,
        acceptanceCriteria: ["Criterion 1", "Criterion 2"],
        acceptanceCriteriaAsChecklist: true,
      };

      const result = TaskDefinitionSchema.safeParse(task);
      expect(result.success).toBe(true);
    });

    test("should accept condition", () => {
      const task = {
        title: "Task",
        estimationPercent: 50,
        condition: '${story.tags} CONTAINS "security"',
      };

      const result = TaskDefinitionSchema.safeParse(task);
      expect(result.success).toBe(true);
    });
  });

  describe("EstimationConfigSchema", () => {
    test("should accept valid config", () => {
      const config = {
        strategy: "percentage",
        rounding: "nearest",
        minimumTaskPoints: 0.5,
      };

      const result = EstimationConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    test("should use default strategy", () => {
      const config = {};

      const result = EstimationConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.strategy).toBe("percentage");
        expect(result.data.rounding).toBe("nearest");
      }
    });

    test("should accept all strategies", () => {
      const strategies = ["percentage", "fixed", "hours", "fibonacci"] as const;

      strategies.forEach((strategy) => {
        const config = { strategy };
        const result = EstimationConfigSchema.safeParse(config);
        expect(result.success).toBe(true);
      });
    });

    test("should reject invalid strategy", () => {
      const config = {
        strategy: "invalid",
      };

      const result = EstimationConfigSchema.safeParse(config);
      expect(result.success).toBe(false);
    });
  });

  describe("ValidationConfigSchema", () => {
    test("should accept valid config", () => {
      const config = {
        totalEstimationMustBe: 100,
        minTasks: 3,
        maxTasks: 10,
      };

      const result = ValidationConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    test("should accept estimation range", () => {
      const config = {
        totalEstimationRange: {
          min: 95,
          max: 105,
        },
      };

      const result = ValidationConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    test("should accept task estimation range", () => {
      const config = {
        taskEstimationRange: {
          min: 5,
          max: 40,
        },
      };

      const result = ValidationConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    test("should accept required tasks", () => {
      const config = {
        requiredTasks: [{ title: "Code Review" }, { title: "Testing" }],
      };

      const result = ValidationConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });
  });

  describe("TaskTemplateSchema", () => {
    test("should accept valid template", () => {
      const template = {
        version: "1.0",
        name: "Test Template",
        filter: {
          workItemTypes: ["User Story"],
        },
        tasks: [
          {
            title: "Task 1",
            estimationPercent: 100,
          },
        ],
      };

      const result = TaskTemplateSchema.safeParse(template);
      expect(result.success).toBe(true);
    });

    test("should require name", () => {
      const template = {
        version: "1.0",
        filter: {},
        tasks: [
          {
            title: "Task 1",
            estimationPercent: 100,
          },
        ],
      };

      const result = TaskTemplateSchema.safeParse(template);
      expect(result.success).toBe(false);
    });

    test("should require at least one task", () => {
      const template = {
        version: "1.0",
        name: "Test",
        filter: {},
        tasks: [],
      };

      const result = TaskTemplateSchema.safeParse(template);
      expect(result.success).toBe(false);
    });

    test("should accept complete template with all fields", () => {
      const template = {
        version: "1.0",
        name: "Complete Template",
        description: "A complete template",
        author: "Test Author",
        tags: ["test"],
        created: "2024-01-01",
        lastModified: "2024-01-02",

        filter: {
          workItemTypes: ["User Story"],
          states: ["New"],
        },

        tasks: [
          {
            id: "task1",
            title: "Task 1",
            estimationPercent: 50,
          },
          {
            id: "task2",
            title: "Task 2",
            estimationPercent: 50,
            dependsOn: ["task1"],
          },
        ],

        estimation: {
          strategy: "percentage",
          rounding: "nearest",
        },

        validation: {
          totalEstimationMustBe: 100,
          minTasks: 2,
        },

        metadata: {
          category: "Development",
          difficulty: "intermediate",
        },

        variables: {
          customVar: "value",
        },
      };

      const result = TaskTemplateSchema.safeParse(template);
      expect(result.success).toBe(true);
    });

    test("should use default version", () => {
      const template = {
        name: "Test",
        filter: {},
        tasks: [{ title: "Task", estimationPercent: 100 }],
      };

      const result = TaskTemplateSchema.safeParse(template);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.version).toBe("1.0");
      }
    });

    test("should accept extends field", () => {
      const template = {
        version: "1.0",
        name: "Extended Template",
        extends: "./base-template.yaml",
        filter: {},
        tasks: [{ title: "Task", estimationPercent: 100 }],
      };

      const result = TaskTemplateSchema.safeParse(template);
      expect(result.success).toBe(true);
    });
  });
});
