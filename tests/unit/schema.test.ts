import { describe, expect, test } from "bun:test";
import {
  EstimationConfigSchema,
  FilterCriteriaSchema,
  TaskDefinitionSchema,
  TaskTemplateSchema,
  ValidationConfigSchema,
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

    test("should accept valid email in assignedTo", () => {
      const filter = {
        assignedTo: ["john@example.com", "jane@example.com"],
      };

      const result = FilterCriteriaSchema.safeParse(filter);
      expect(result.success).toBe(true);
    });

    test("should accept @Me in assignedTo", () => {
      const filter = {
        assignedTo: ["@Me"],
      };

      const result = FilterCriteriaSchema.safeParse(filter);
      expect(result.success).toBe(true);
    });

    test("should accept both email and @Me in assignedTo", () => {
      const filter = {
        assignedTo: ["@Me", "john@example.com"],
      };

      const result = FilterCriteriaSchema.safeParse(filter);
      expect(result.success).toBe(true);
    });

    test("should reject invalid email in assignedTo", () => {
      const filter = {
        assignedTo: ["not-an-email"],
      };

      const result = FilterCriteriaSchema.safeParse(filter);
      expect(result.success).toBe(false);
    });

    test("should reject invalid macro in assignedTo", () => {
      const filter = {
        assignedTo: ["@Unknown"],
      };

      const result = FilterCriteriaSchema.safeParse(filter);
      expect(result.success).toBe(false);
    });

    test("should accept @CurrentIteration as a valid iterations value", () => {
      const filter = {
        iterations: ["@CurrentIteration"],
      };

      const result = FilterCriteriaSchema.safeParse(filter);
      expect(result.success).toBe(true);
    });

    test("should accept mixed @CurrentIteration and real iteration paths", () => {
      const filter = {
        iterations: ["@CurrentIteration", "MyProject\\Sprint 1"],
      };

      const result = FilterCriteriaSchema.safeParse(filter);
      expect(result.success).toBe(true);
    });

    test("should accept @TeamAreas as a valid areaPaths value", () => {
      const result = FilterCriteriaSchema.safeParse({
        areaPaths: ["@TeamAreas"],
      });
      expect(result.success).toBe(true);
    });

    test("should accept mixed @TeamAreas and real area paths", () => {
      const result = FilterCriteriaSchema.safeParse({
        areaPaths: ["@TeamAreas", "MyProject\\Backend"],
      });
      expect(result.success).toBe(true);
    });

    test("should accept @Today macro in changedAfter", () => {
      const result = FilterCriteriaSchema.safeParse({ changedAfter: "@Today" });
      expect(result.success).toBe(true);
    });

    test("should accept @Today offset in changedAfter", () => {
      const result = FilterCriteriaSchema.safeParse({
        changedAfter: "@Today-7",
      });
      expect(result.success).toBe(true);
    });

    test("should accept literal date in createdAfter", () => {
      const result = FilterCriteriaSchema.safeParse({
        createdAfter: "2026-01-01",
      });
      expect(result.success).toBe(true);
    });

    test("should reject WIQL-injected changedAfter", () => {
      const result = FilterCriteriaSchema.safeParse({
        changedAfter: "2026-01-01' OR [System.State] <> ''",
      });
      expect(result.success).toBe(false);
    });

    test("should reject WIQL-injected createdAfter", () => {
      const result = FilterCriteriaSchema.safeParse({
        createdAfter: "2026-06-01' OR 1=1--",
      });
      expect(result.success).toBe(false);
    });

    test("should reject arbitrary strings in changedAfter", () => {
      const result = FilterCriteriaSchema.safeParse({
        changedAfter: "last week",
      });
      expect(result.success).toBe(false);
    });

    test("should accept all approved date macros in changedAfter", () => {
      for (const macro of [
        "@Today",
        "@StartOfDay",
        "@StartOfMonth",
        "@StartOfWeek",
        "@StartOfYear",
        "@Today-7",
        "@StartOfMonth + 1",
      ]) {
        const result = FilterCriteriaSchema.safeParse({ changedAfter: macro });
        expect(result.success, `Expected ${macro} to be accepted`).toBe(true);
      }
    });

    test("should accept statesExclude", () => {
      const result = FilterCriteriaSchema.safeParse({
        statesExclude: ["Closed", "Removed"],
      });
      expect(result.success).toBe(true);
    });

    test("should accept statesWereEver", () => {
      const result = FilterCriteriaSchema.safeParse({
        statesWereEver: ["Active", "In Progress"],
      });
      expect(result.success).toBe(true);
    });

    test("should accept areaPathsUnder", () => {
      const result = FilterCriteriaSchema.safeParse({
        areaPathsUnder: ["MyProject\\TeamA"],
      });
      expect(result.success).toBe(true);
    });

    test("should accept iterationsUnder", () => {
      const result = FilterCriteriaSchema.safeParse({
        iterationsUnder: ["MyProject\\Release 1"],
      });
      expect(result.success).toBe(true);
    });

    test("should accept all new filter fields combined", () => {
      const result = FilterCriteriaSchema.safeParse({
        statesExclude: ["Closed"],
        statesWereEver: ["Active"],
        areaPathsUnder: ["MyProject\\Backend"],
        iterationsUnder: ["MyProject\\Release 1"],
      });
      expect(result.success).toBe(true);
    });

    test("should accept optional team override", () => {
      const result = FilterCriteriaSchema.safeParse({
        states: ["Active"],
        team: "Frontend Team",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.team).toBe("Frontend Team");
      }
    });

    test("should allow filter without team (team is optional)", () => {
      const result = FilterCriteriaSchema.safeParse({ states: ["Active"] });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.team).toBeUndefined();
      }
    });

    test("should accept savedQuery with id", () => {
      const result = FilterCriteriaSchema.safeParse({
        savedQuery: { id: "a1b2c3d4-e5f6-47b8-8901-234567890123" },
      });
      expect(result.success).toBe(true);
    });

    test("should accept savedQuery with path", () => {
      const result = FilterCriteriaSchema.safeParse({
        savedQuery: { path: "Shared Queries/Sprint Active Stories" },
      });
      expect(result.success).toBe(true);
    });

    test("should reject savedQuery with neither id nor path", () => {
      const result = FilterCriteriaSchema.safeParse({
        savedQuery: {},
      });
      expect(result.success).toBe(false);
    });

    test("should reject savedQuery with both id and path", () => {
      const result = FilterCriteriaSchema.safeParse({
        savedQuery: {
          id: "a1b2c3d4-e5f6-47b8-8901-234567890123",
          path: "Shared Queries/Sprint Active Stories",
        },
      });
      expect(result.success).toBe(false);
    });

    test("should reject savedQuery with non-UUID id", () => {
      const result = FilterCriteriaSchema.safeParse({
        savedQuery: { id: "not-a-uuid" },
      });
      expect(result.success).toBe(false);
    });

    test("should reject savedQuery with empty path", () => {
      const result = FilterCriteriaSchema.safeParse({
        savedQuery: { path: "" },
      });
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
        //biome-ignore lint/suspicious: The condition field is needed for user input
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
        expect(result.data.rounding).toBe("none");
      }
    });

    test("should accept all strategies", () => {
      const strategies = ["percentage"] as const;

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
