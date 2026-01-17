import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import { TemplateLoader } from "@templates/loader";
import { TemplateLoadError } from "@utils/errors";

describe("TemplateLoader", () => {
  const loader = new TemplateLoader();
  const fixturesPath = resolve(__dirname, "../fixtures/templates");

  describe("load", () => {
    test("should load a valid YAML template", async () => {
      const templatePath = resolve(fixturesPath, "valid-template.yaml");
      const template = await loader.load(templatePath);

      expect(template).toBeDefined();
      expect(template.name).toBe("Test Template");
      expect(template.version).toBe("1.0");
      expect(template.tasks).toHaveLength(2);
    });

    test("should load template with correct structure", async () => {
      const templatePath = resolve(fixturesPath, "valid-template.yaml");
      const template = await loader.load(templatePath);

      expect(template.filter).toBeDefined();
      expect(template.filter.workItemTypes).toEqual(["User Story"]);
      expect(template.filter.states).toEqual(["New"]);
      expect(template.filter.tags?.include).toEqual(["test"]);
    });

    test("should load tasks with all properties", async () => {
      const templatePath = resolve(fixturesPath, "valid-template.yaml");
      const template = await loader.load(templatePath);

      const task1 = template.tasks[0];
      expect(task1?.id).toBe("task1");
      expect(task1?.title).toBe("Task 1");
      expect(task1?.estimationPercent).toBe(50);
      expect(task1?.tags).toEqual(["dev"]);

      const task2 = template.tasks[1];
      expect(task2?.dependsOn).toEqual(["task1"]);
    });

    test("should throw TemplateLoadError for non-existent file", async () => {
      const templatePath = resolve(fixturesPath, "does-not-exist.yaml");

      await expect(loader.load(templatePath)).rejects.toThrow(
        TemplateLoadError
      );
    });

    test("should throw TemplateLoadError with file path", async () => {
      const templatePath = resolve(fixturesPath, "does-not-exist.yaml");

      try {
        await loader.load(templatePath);
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error).toBeInstanceOf(TemplateLoadError);
        if (error instanceof TemplateLoadError) {
          expect(error.filePath).toBe(templatePath);
        }
      }
    });

    test("should handle relative paths", async () => {
      const template = await loader.load(
        "tests/fixtures/templates/valid-template.yaml"
      );
      expect(template.name).toBe("Test Template");
    });

    test("should handle absolute paths", async () => {
      const absolutePath = resolve(fixturesPath, "valid-template.yaml");
      const template = await loader.load(absolutePath);
      expect(template.name).toBe("Test Template");
    });
  });

  describe("loadMultiple", () => {
    test("should load multiple templates", async () => {
      const paths = [
        resolve(fixturesPath, "valid-template.yaml"),
        resolve(fixturesPath, "invalid-estimation.yaml"),
      ];

      const templates = await loader.loadMultiple(paths);

      expect(templates).toHaveLength(2);
      expect(templates[0]?.name).toBe("Test Template");
      expect(templates[1]?.name).toBe("Invalid Estimation Template");
    });

    test("should return empty array for empty input", async () => {
      const templates = await loader.loadMultiple([]);
      expect(templates).toEqual([]);
    });

    test("should fail if any template fails to load", async () => {
      const paths = [
        resolve(fixturesPath, "valid-template.yaml"),
        resolve(fixturesPath, "does-not-exist.yaml"),
      ];

      await expect(loader.loadMultiple(paths)).rejects.toThrow(
        TemplateLoadError
      );
    });
  });

  describe("canLoad", () => {
    test("should return true for valid template", async () => {
      const templatePath = resolve(fixturesPath, "valid-template.yaml");
      const result = await loader.canLoad(templatePath);
      expect(result).toBe(true);
    });

    test("should return false for non-existent file", async () => {
      const templatePath = resolve(fixturesPath, "does-not-exist.yaml");
      const result = await loader.canLoad(templatePath);
      expect(result).toBe(false);
    });

    test("should return true even for invalid templates", async () => {
      const templatePath = resolve(fixturesPath, "invalid-estimation.yaml");
      const result = await loader.canLoad(templatePath);
      expect(result).toBe(true);
    });
  });
});
