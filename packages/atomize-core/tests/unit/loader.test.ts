import { describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { MAX_TEMPLATE_FILE_BYTES } from "@sppg2001/atomize-core/templates/template-file";
import { TemplateLibrary } from "@sppg2001/atomize-core/templates/template-library";
import { TemplateLoadError } from "@sppg2001/atomize-core/utils/errors";
import { expectToReject } from "../utils/matchers";

const library = new TemplateLibrary();
const load = async (path: string) => (await library.loadSource(path)).template;

describe("loading a Template file", () => {
  const fixturesPath = resolve(__dirname, "../fixtures/templates");

  describe("load", () => {
    test("should load a valid YAML template", async () => {
      const templatePath = resolve(fixturesPath, "valid-template.yaml");
      const template = await load(templatePath);

      expect(template).toBeDefined();
      expect(template.name).toBe("Test Template");
      expect(template.version).toBe("1.0");
      expect(template.tasks).toHaveLength(2);
    });

    test("should load template with correct structure", async () => {
      const templatePath = resolve(fixturesPath, "valid-template.yaml");
      const template = await load(templatePath);

      expect(template.filter).toBeDefined();
      expect(template.filter.workItemTypes).toEqual(["User Story"]);
      expect(template.filter.states).toEqual(["New"]);
      expect(template.filter.tags?.include).toEqual(["test"]);
    });

    test("should load tasks with all properties", async () => {
      const templatePath = resolve(fixturesPath, "valid-template.yaml");
      const template = await load(templatePath);

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

      await expectToReject(load(templatePath), TemplateLoadError);
    });

    test("should throw TemplateLoadError with file path", async () => {
      const templatePath = resolve(fixturesPath, "does-not-exist.yaml");

      try {
        await load(templatePath);
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error).toBeInstanceOf(TemplateLoadError);
        if (error instanceof TemplateLoadError) {
          expect(error.filePath).toBe(templatePath);
        }
      }
    });

    test("should handle relative paths", async () => {
      const template = await load(
        "tests/fixtures/templates/valid-template.yaml"
      );
      expect(template.name).toBe("Test Template");
    });

    test("should handle absolute paths", async () => {
      const absolutePath = resolve(fixturesPath, "valid-template.yaml");
      const template = await load(absolutePath);
      expect(template.name).toBe("Test Template");
    });

    test("should reject local templates above the size limit before parsing", async () => {
      const tempDir = await mkdtemp(resolve(tmpdir(), "atomize-large-template-"));
      const largeTemplatePath = resolve(tempDir, "large.yaml");

      try {
        await writeFile(largeTemplatePath, "x".repeat(MAX_TEMPLATE_FILE_BYTES + 1), "utf-8");

        await expectToReject(load(largeTemplatePath), "Template file too large");
      } finally {
        await rm(tempDir, { recursive: true, force: true });
      }
    });
  });
});
