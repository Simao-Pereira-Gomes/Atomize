import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import { TemplateLoader } from "@templates/loader";
import { TemplateValidator } from "@templates/validator";
import { TemplateLoadError } from "@/utils/errors";

describe("Integration Tests", () => {
  const loader = new TemplateLoader();
  const validator = new TemplateValidator();
  const fixturesPath = resolve(__dirname, "../tests/fixtures/templates");

  describe("Load and Validate Flow", () => {
    test("should load and validate backend template", async () => {
      const templatePath = resolve(__dirname, "../examples/backend.yaml");
      const template = await loader.load(templatePath);
      expect(template).toBeDefined();
      expect(template.name).toBe("Backend API Feature");
      const result = validator.validate(template);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test("should load and validate frontend template", async () => {
      const templatePath = resolve(__dirname, "../examples/frontend.yaml");
      const template = await loader.load(templatePath);
      expect(template.name).toBe("Frontend React Feature");
      const result = validator.validate(template);
      expect(result.valid).toBe(true);
    });

    test("should load and validate fullstack template", async () => {
      const templatePath = resolve(__dirname, "../examples/fullstack.yaml");
      const template = await loader.load(templatePath);
      expect(template.name).toBe("Fullstack Feature");
      const result = validator.validate(template);
      expect(result.valid).toBe(true);
    });

    test("should handle complete workflow for valid template", async () => {
      const templatePath = resolve(fixturesPath, "valid-template.yaml");
      const template = await loader.load(templatePath);
      const result = validator.validate(template);
      expect(result.valid).toBe(true);
    });

    test("should handle complete workflow for invalid template", async () => {
      const templatePath = resolve(fixturesPath, "invalid-estimation.yaml");
      const template = await loader.load(templatePath);
      const result = validator.validate(template);
      const formatted = validator.formatResult(result);

      expect(result.valid).toBe(false);
      expect(formatted).toContain("70%");
    });
  });

  describe("Real-world Template Validation", () => {
    test("backend template should have correct task count", async () => {
      const template = await loader.load(
        resolve(__dirname, "../examples/backend.yaml")
      );

      expect(template.tasks).toHaveLength(6);
      expect(template.tasks[0]?.id).toBe("design-api");
      expect(template.tasks[5]?.id).toBe("code-review");
    });

    test("backend template should have 100% estimation", async () => {
      const template = await loader.load(
        resolve(__dirname, "../examples/backend.yaml")
      );

      const total = template.tasks.reduce((sum, task) => {
        return sum + (task.estimationPercent || 0);
      }, 0);

      expect(total).toBe(100);
    });

    test("backend template should have valid dependencies", async () => {
      const template = await loader.load(
        resolve(__dirname, "../examples/backend.yaml")
      );

      const result = validator.validate(template);

      const depErrors = result.errors.filter(
        (e) => e.code === "INVALID_DEPENDENCY"
      );
      expect(depErrors).toHaveLength(0);
    });

    test("fullstack template should support conditionals", async () => {
      const template = await loader.load(
        resolve(__dirname, "../examples/fullstack.yaml")
      );

      const conditionalTasks = template.tasks.filter((t) => t.condition);
      expect(conditionalTasks.length).toBeGreaterThan(0);
    });

    test("all production templates should be valid", async () => {
      const templates = [
        "../examples/backend.yaml",
        "../examples/frontend.yaml",
        "../examples/fullstack.yaml",
      ];

      for (const templatePath of templates) {
        const template = await loader.load(resolve(__dirname, templatePath));
        const result = validator.validate(template);

        expect(result.valid).toBe(true);
      }
    });
  });

  describe("Error Handling", () => {
    test("should provide helpful error for missing file", async () => {
      const templatePath = "/nonexistent/template.yaml";
      try {
        await loader.load(templatePath);
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(TemplateLoadError);
        expect((error as TemplateLoadError).message).toContain(
          "Failed to load template"
        );
        expect((error as TemplateLoadError).filePath).toBe(templatePath);
      }
    });

    test("should provide detailed validation errors", async () => {
      const template = await loader.load(
        resolve(fixturesPath, "invalid-estimation.yaml")
      );

      const result = validator.validate(template);

      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toHaveProperty("path");
      expect(result.errors[0]).toHaveProperty("message");
      expect(result.errors[0]).toHaveProperty("code");
    });
  });

  describe("validateOrThrow usage", () => {
    test("should work in try-catch pattern", async () => {
      const validTemplate = await loader.load(
        resolve(fixturesPath, "valid-template.yaml")
      );

      try {
        const validated = validator.validateOrThrow(validTemplate);
        expect(validated.name).toBe("Test Template");
      } catch (_error) {
        expect(true).toBe(false);
      }
    });

    test("should throw on invalid template", async () => {
      const invalidTemplate = await loader.load(
        resolve(fixturesPath, "invalid-estimation.yaml")
      );

      let caught = false;
      try {
        validator.validateOrThrow(invalidTemplate);
      } catch (error) {
        caught = true;
        expect(error).toHaveProperty("errors");
      }

      expect(caught).toBe(true);
    });
  });

  describe("Template Features", () => {
    test("should support all filter types", async () => {
      const template = await loader.load(
        resolve(__dirname, "../examples/backend.yaml")
      );

      expect(template.filter.workItemTypes).toBeDefined();
      expect(template.filter.states).toBeDefined();
      expect(template.filter.tags).toBeDefined();
      expect(template.filter.excludeIfHasTasks).toBe(true);
    });

    test("should support task metadata", async () => {
      const template = await loader.load(
        resolve(__dirname, "../examples/backend.yaml")
      );

      const task = template.tasks[0];
      expect(task?.title).toBeDefined();
      expect(task?.description).toBeDefined();
      expect(task?.estimationPercent).toBeDefined();
      expect(task?.tags).toBeDefined();
      expect(task?.activity).toBeDefined();
    });

    test("should support estimation configuration", async () => {
      const template = await loader.load(
        resolve(__dirname, "../examples/backend.yaml")
      );

      expect(template.estimation).toBeDefined();
      expect(template.estimation?.strategy).toBe("percentage");
      expect(template.estimation?.rounding).toBe("nearest");
    });

    test("should support validation configuration", async () => {
      const template = await loader.load(
        resolve(__dirname, "../examples/backend.yaml")
      );

      expect(template.validation).toBeDefined();
      expect(template.validation?.totalEstimationMustBe).toBe(100);
      expect(template.validation?.minTasks).toBeDefined();
    });

    test("should support metadata", async () => {
      const template = await loader.load(
        resolve(__dirname, "../examples/backend.yaml")
      );

      expect(template.metadata).toBeDefined();
      expect(template.metadata?.category).toBe("Backend Development");
      expect(template.metadata?.difficulty).toBe("intermediate");
      expect(template.metadata?.recommendedFor).toBeDefined();
    });
  });
});
