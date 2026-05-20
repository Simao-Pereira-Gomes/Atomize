import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import { TemplateLoader } from "@templates/loader";
import { TemplateValidator } from "@templates/validator";
import { TemplateCompositionError, TemplateLoadError } from "@/utils/errors";

describe("Integration Tests", () => {
  const loader = new TemplateLoader();
  const validator = new TemplateValidator();
  const fixturesPath = resolve(__dirname, "../fixtures/templates");
  const examplesFolder = resolve(__dirname, "../../examples");

  describe("Load and Validate Flow", () => {
    test("should load and validate backend template", async () => {
      const templatePath = resolve(examplesFolder, "backend.yaml");
      const template = await loader.load(templatePath);
      expect(template).toBeDefined();
      expect(template.name).toBe("Backend API Feature");
      const result = validator.validate(template);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test("should load and validate frontend template", async () => {
      const templatePath = resolve(examplesFolder, "frontend.yaml");
      const template = await loader.load(templatePath);
      expect(template.name).toBe("Frontend React Feature");
      const result = validator.validate(template);
      expect(result.valid).toBe(true);
    });

    test("should load and validate fullstack template", async () => {
      const templatePath = resolve(examplesFolder, "fullstack.yaml");
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
        resolve(examplesFolder, "backend.yaml")
      );

      expect(template.tasks).toHaveLength(6);
      expect(template.tasks[0]?.id).toBe("design-api");
      expect(template.tasks[5]?.id).toBe("code-review");
    });

    test("backend template should have 100% estimation", async () => {
      const template = await loader.load(
        resolve(examplesFolder, "backend.yaml")
      );

      const total = template.tasks.reduce((sum, task) => {
        return sum + (task.estimationPercent || 0);
      }, 0);

      expect(total).toBe(100);
    });

    test("backend template should have valid dependencies", async () => {
      const template = await loader.load(
        resolve(examplesFolder, "backend.yaml")
      );

      const result = validator.validate(template);

      const depErrors = result.errors.filter(
        (e) => e.code === "INVALID_DEPENDENCY"
      );
      expect(depErrors).toHaveLength(0);
    });

    test("fullstack template should support conditionals", async () => {
      const template = await loader.load(
        resolve(examplesFolder, "fullstack.yaml")
      );

      const conditionalTasks = template.tasks.filter((t) => t.condition);
      expect(conditionalTasks.length).toBeGreaterThan(0);
    });

    test("all production templates should be valid", async () => {
      const templates = [
        "backend.yaml",
        "frontend.yaml",
        "fullstack.yaml",
      ];

      for (const templatePath of templates) {
        const template = await loader.load(resolve(examplesFolder, templatePath));
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
        resolve(examplesFolder, "backend.yaml")
      );

      expect(template.filter.workItemTypes).toBeDefined();
      expect(template.filter.states).toBeDefined();
      expect(template.filter.tags).toBeDefined();
      expect(template.filter.excludeIfHasTasks).toBe(true);
    });

    test("should support task metadata", async () => {
      const template = await loader.load(
        resolve(examplesFolder, "backend.yaml")
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
        resolve(examplesFolder, "backend.yaml")
      );

      expect(template.estimation).toBeDefined();
      expect(template.estimation?.strategy).toBe("percentage");
      expect(template.estimation?.rounding).toBe("nearest");
    });

    test("should support validation configuration", async () => {
      const template = await loader.load(
        resolve(examplesFolder, "backend.yaml")
      );

      expect(template.validation).toBeDefined();
      expect(template.validation?.totalEstimationMustBe).toBe(100);
      expect(template.validation?.minTasks).toBeDefined();
    });

    test("should support metadata", async () => {
      const template = await loader.load(
        resolve(examplesFolder, "backend.yaml")
      );

      expect(template.metadata).toBeDefined();
      expect(template.metadata?.category).toBe("Backend Development");
      expect(template.metadata?.difficulty).toBe("intermediate");
      expect(template.metadata?.recommendedFor).toBeDefined();
    });
  });

  describe("Template Composition", () => {
    test("child template inherits filter and tasks from parent", async () => {
      const template = await loader.load(resolve(fixturesPath, "child-template.yaml"));

      expect(template.name).toBe("Child Template");
      expect(template.filter.workItemTypes).toEqual(["User Story"]);
      expect(template.filter.states).toEqual(["New", "Active"]);
    });

    test("child template overrides parent task by id", async () => {
      const template = await loader.load(resolve(fixturesPath, "child-template.yaml"));

      const designTask = template.tasks.find((t) => t.id === "design");
      expect(designTask?.estimationPercent).toBe(15);
      expect(designTask?.description).toBe("Overridden design task");
    });

    test("child template appends new tasks to parent", async () => {
      const template = await loader.load(resolve(fixturesPath, "child-template.yaml"));

      const taskIds = template.tasks.map((t) => t.id);
      expect(taskIds).toContain("implement");
      expect(taskIds).toContain("test");
      expect(taskIds).toContain("deploy");
    });

    test("composed child template is valid at 100% estimation", async () => {
      const template = await loader.load(resolve(fixturesPath, "child-template.yaml"));
      const result = validator.validate(template);

      expect(result.valid).toBe(true);
      const total = template.tasks.reduce((s, t) => s + (t.estimationPercent ?? 0), 0);
      expect(total).toBe(100);
    });

    test("template with mixins includes mixin tasks", async () => {
      const template = await loader.load(resolve(fixturesPath, "template-with-mixins.yaml"));

      const taskIds = template.tasks.map((t) => t.id);
      expect(taskIds).toContain("dependency-audit");
      expect(taskIds).toContain("implement");
    });

    test("child overrides mixin task by matching id", async () => {
      const template = await loader.load(resolve(fixturesPath, "template-with-mixins.yaml"));

      const securityTask = template.tasks.find((t) => t.id === "security-review");
      expect(securityTask?.estimationPercent).toBe(8);
      expect(securityTask?.description).toBe("Overridden security task from mixin");
    });

    test("mixins-only template (no extends) applies mixin tasks", async () => {
      const template = await loader.load(resolve(fixturesPath, "mixins-only-template.yaml"));

      const taskIds = template.tasks.map((t) => t.id);
      expect(taskIds).toContain("dependency-audit");
      expect(taskIds).toContain("my-task");
    });

    test("multi-level inheritance resolves full chain", async () => {
      const template = await loader.load(resolve(fixturesPath, "parent-template.yaml"));

      const taskIds = template.tasks.map((t) => t.id);
      expect(taskIds).toContain("gp-task");
      expect(taskIds).toContain("parent-task");

      const gpTask = template.tasks.find((t) => t.id === "gp-task");
      expect(gpTask?.title).toBe("Overridden by Parent");
    });

    test("multi-level inheritance inherits grandparent filter", async () => {
      const template = await loader.load(resolve(fixturesPath, "parent-template.yaml"));

      expect(template.filter.workItemTypes).toEqual(["User Story"]);
      expect(template.filter.states).toEqual(["New"]);
    });

    test("loadWithMeta reports composition metadata for inheriting template", async () => {
      const { meta } = await loader.loadWithMeta(resolve(fixturesPath, "child-template.yaml"));

      expect(meta.isComposed).toBe(true);
      expect(meta.extendsRef).toContain("base-template.yaml");
      expect(meta.mixinRefs).toHaveLength(0);
    });

    test("loadWithMeta reports mixin refs", async () => {
      const { meta } = await loader.loadWithMeta(resolve(fixturesPath, "template-with-mixins.yaml"));

      expect(meta.isComposed).toBe(true);
      expect(meta.mixinRefs).toHaveLength(1);
    });

    test("loadWithMeta marks plain templates as not composed", async () => {
      const { meta } = await loader.loadWithMeta(resolve(fixturesPath, "valid-template.yaml"));

      expect(meta.isComposed).toBe(false);
    });

    test("circular inheritance throws TemplateCompositionError", async () => {
      await expect(
        loader.load(resolve(fixturesPath, "circular-a.yaml")),
      ).rejects.toBeInstanceOf(TemplateCompositionError);
    });
  });
});
