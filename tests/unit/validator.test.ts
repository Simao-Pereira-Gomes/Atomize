import { describe, expect, test } from "bun:test";
import { TemplateValidator } from "@templates/validator";
import { TemplateLoader } from "@templates/loader";
import { TemplateValidationError } from "@utils/errors";
import { resolve } from "path";

describe("TemplateValidator", () => {
  const validator = new TemplateValidator();
  const loader = new TemplateLoader();
  const fixturesPath = resolve(__dirname, "../fixtures/templates");

  describe("validate", () => {
    test("should validate a correct template", async () => {
      const template = await loader.load(
        resolve(fixturesPath, "valid-template.yaml")
      );
      const result = validator.validate(template);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test("should return validation result with errors and warnings", async () => {
      const template = await loader.load(
        resolve(fixturesPath, "valid-template.yaml")
      );
      const result = validator.validate(template);

      expect(result).toHaveProperty("valid");
      expect(result).toHaveProperty("errors");
      expect(result).toHaveProperty("warnings");
      expect(Array.isArray(result.errors)).toBe(true);
      expect(Array.isArray(result.warnings)).toBe(true);
    });

    test("should detect invalid estimation total", async () => {
      const template = await loader.load(
        resolve(fixturesPath, "invalid-estimation.yaml")
      );
      const result = validator.validate(template);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);

      const estimationError = result.errors.find(
        (e) => e.code === "INVALID_TOTAL_ESTIMATION"
      );
      expect(estimationError).toBeDefined();
      expect(estimationError?.message).toContain("70%");
      expect(estimationError?.message).toContain("100%");
    });

    test("should detect invalid dependencies", async () => {
      const template = await loader.load(
        resolve(fixturesPath, "invalid-dependency.yaml")
      );
      const result = validator.validate(template);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);

      const depError = result.errors.find(
        (e) => e.code === "INVALID_DEPENDENCY"
      );
      expect(depError).toBeDefined();
      expect(depError?.message).toContain("nonexistent-task");
    });

    test("should validate required fields", () => {
      const invalidTemplate = {
        version: "1.0",
        // Missing 'name'
        filter: {},
        tasks: [],
      };

      const result = validator.validate(invalidTemplate);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    test("should validate task title is required", () => {
      const template = {
        version: "1.0",
        name: "Test",
        filter: { workItemTypes: ["User Story"] },
        tasks: [
          {
            // Missing title
            estimationPercent: 100,
          },
        ],
      };

      const result = validator.validate(template);

      expect(result.valid).toBe(false);
      const titleError = result.errors.find((e) => e.path.includes("title"));
      expect(titleError).toBeDefined();
    });

    test("should validate estimation range", () => {
      const template = {
        version: "1.0",
        name: "Test",
        filter: {},
        tasks: [
          {
            title: "Task",
            estimationPercent: 150, // Invalid: > 100
          },
        ],
      };

      const result = validator.validate(template);

      expect(result.valid).toBe(false);
    });

    test("should validate task count limits", async () => {
      const template = {
        version: "1.0",
        name: "Test",
        filter: {},
        tasks: [{ title: "Task 1", estimationPercent: 100 }],
        validation: {
          minTasks: 3,
        },
      };

      const result = validator.validate(template);

      expect(result.valid).toBe(false);
      const taskCountError = result.errors.find(
        (e) => e.code === "TOO_FEW_TASKS"
      );
      expect(taskCountError).toBeDefined();
    });

    test("should warn on estimation not 100% without validation config", () => {
      const template = {
        version: "1.0",
        name: "Test",
        filter: {},
        tasks: [{ title: "Task 1", estimationPercent: 80 }],
        // No validation config
      };

      const result = validator.validate(template);

      // Should be valid but with warnings
      expect(result.valid).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);

      const estimationWarning = result.warnings.find((w) =>
        w.message.includes("80%")
      );
      expect(estimationWarning).toBeDefined();
    });

    test("should accept estimation within range", () => {
      const template = {
        version: "1.0",
        name: "Test",
        filter: {},
        tasks: [{ title: "Task 1", estimationPercent: 95 }],
        validation: {
          totalEstimationRange: {
            min: 90,
            max: 110,
          },
        },
      };

      const result = validator.validate(template);

      expect(result.valid).toBe(true);
    });

    test("should reject estimation outside range", () => {
      const template = {
        version: "1.0",
        name: "Test",
        filter: {},
        tasks: [{ title: "Task 1", estimationPercent: 80 }],
        validation: {
          totalEstimationRange: {
            min: 95,
            max: 105,
          },
        },
      };

      const result = validator.validate(template);

      expect(result.valid).toBe(false);
      const rangeError = result.errors.find(
        (e) => e.code === "INVALID_ESTIMATION_RANGE"
      );
      expect(rangeError).toBeDefined();
    });
  });

  describe("validateOrThrow", () => {
    test("should return template if valid", async () => {
      const template = await loader.load(
        resolve(fixturesPath, "valid-template.yaml")
      );
      const validated = validator.validateOrThrow(template);

      expect(validated).toBeDefined();
      expect(validated.name).toBe("Test Template");
    });

    test("should throw TemplateValidationError if invalid", async () => {
      const template = await loader.load(
        resolve(fixturesPath, "invalid-estimation.yaml")
      );

      expect(() => validator.validateOrThrow(template)).toThrow(
        TemplateValidationError
      );
    });

    test("should include error details in exception", async () => {
      const template = await loader.load(
        resolve(fixturesPath, "invalid-estimation.yaml")
      );

      try {
        validator.validateOrThrow(template);
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error).toBeInstanceOf(TemplateValidationError);
        if (error instanceof TemplateValidationError) {
          expect(error.errors.length).toBeGreaterThan(0);
        }
      }
    });
  });

  describe("formatResult", () => {
    test("should format valid result", async () => {
      const template = await loader.load(
        resolve(fixturesPath, "valid-template.yaml")
      );
      const result = validator.validate(template);
      const formatted = validator.formatResult(result);

      expect(formatted).toContain("valid");
    });

    test("should format invalid result with errors", async () => {
      const template = await loader.load(
        resolve(fixturesPath, "invalid-estimation.yaml")
      );
      const result = validator.validate(template);
      const formatted = validator.formatResult(result);

      expect(formatted).toContain("Errors:");
    });

    test("should format warnings", () => {
      const template = {
        version: "1.0",
        name: "Test",
        filter: {},
        tasks: [{ title: "Task 1", estimationPercent: 80 }],
      };

      const result = validator.validate(template);
      const formatted = validator.formatResult(result);

      expect(formatted).toContain("Warnings:");
    });
  });

  describe("business rules validation", () => {
    test("should validate dependencies exist", () => {
      const template = {
        version: "1.0",
        name: "Test",
        filter: {},
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
            dependsOn: ["task1"], // Valid dependency
          },
        ],
        validation: {
          totalEstimationMustBe: 100,
        },
      };

      const result = validator.validate(template);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test("should ignore conditional tasks in estimation", () => {
      const template = {
        version: "1.0",
        name: "Test",
        filter: {},
        tasks: [
          {
            title: "Always Task",
            estimationPercent: 100,
          },
          {
            title: "Conditional Task",
            estimationPercent: 20,
            condition: "${someCondition}",
          },
        ],
        validation: {
          totalEstimationMustBe: 100,
        },
      };

      const result = validator.validate(template);

      expect(result.valid).toBe(true);
    });

    test("should warn on suspicious conditionals", () => {
      const template = {
        version: "1.0",
        name: "Test",
        filter: {},
        tasks: [
          {
            title: "Task",
            estimationPercent: 100,
            condition: "true", // Suspicious: no variables or operators
          },
        ],
      };

      const result = validator.validate(template);

      expect(result.warnings.length).toBeGreaterThan(0);
    });

    test("should validate max tasks limit", () => {
      const template = {
        version: "1.0",
        name: "Test",
        filter: {},
        tasks: [
          { title: "Task 1", estimationPercent: 20 },
          { title: "Task 2", estimationPercent: 20 },
          { title: "Task 3", estimationPercent: 20 },
          { title: "Task 4", estimationPercent: 20 },
          { title: "Task 5", estimationPercent: 20 },
        ],
        validation: {
          maxTasks: 3, // Too many tasks
        },
      };

      const result = validator.validate(template);

      expect(result.valid).toBe(false);
      const maxTasksError = result.errors.find(
        (e) => e.code === "TOO_MANY_TASKS"
      );
      expect(maxTasksError).toBeDefined();
    });
  });
});
