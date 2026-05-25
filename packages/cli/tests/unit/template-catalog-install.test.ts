import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TemplateCatalog } from "@services/template/template-catalog";

const TEST_DIR = join(tmpdir(), `atomize-catalog-install-test-${process.pid}`);

const VALID_TEMPLATE = `name: test-template
description: A test template
filter:
  workItemTypes:
    - User Story
tasks:
  - title: Test task`;

const VALID_MIXIN = `name: test-mixin
tasks:
  - title: Test mixin task`;

const MISSING_REQUIRED_FIELDS = `name: bad-template
description: No filter or tasks`;

function makeCatalog(): TemplateCatalog {
  return new TemplateCatalog({
    userRoot: join(TEST_DIR, "user"),
    projectRoot: join(TEST_DIR, "project"),
    legacyUserRoot: join(TEST_DIR, "legacy-user"),
    legacyProjectRoot: join(TEST_DIR, "legacy-project"),
    packageRoot: join(TEST_DIR, "package"),
  });
}

beforeEach(async () => {
  await rm(TEST_DIR, { recursive: true, force: true });
});

afterEach(async () => {
  await rm(TEST_DIR, { recursive: true, force: true });
});

describe("TemplateCatalog.installFromContent", () => {
  describe("user scope (default)", () => {
    test("installs template and returns correct catalog item", async () => {
      const catalog = makeCatalog();
      const item = await catalog.installFromContent(VALID_TEMPLATE, "test-template.yaml", "template");

      expect(item.name).toBe("test-template");
      expect(item.kind).toBe("template");
      expect(item.scope).toBe("user");
      expect(item.ref).toBe("template:test-template");
      expect(item.path).toContain(join("user", "templates", "test-template.atomize.yaml"));
      expect(existsSync(item.path)).toBe(true);
    });

    test("installs mixin to mixins subdirectory", async () => {
      const catalog = makeCatalog();
      const item = await catalog.installFromContent(VALID_MIXIN, "test-mixin.yaml", "mixin");

      expect(item.kind).toBe("mixin");
      expect(item.path).toContain(join("user", "mixins"));
    });

    test("preserves original content exactly", async () => {
      const catalog = makeCatalog();
      const item = await catalog.installFromContent(VALID_TEMPLATE, "test-template.yaml", "template");

      const written = await readFile(item.path, "utf-8");
      expect(written).toBe(VALID_TEMPLATE);
    });
  });

  describe("project scope", () => {
    test("installs to project root", async () => {
      const catalog = makeCatalog();
      const item = await catalog.installFromContent(VALID_TEMPLATE, "test-template.yaml", "template", "project");

      expect(item.scope).toBe("project");
      expect(item.path).toContain(join(TEST_DIR, "project"));
    });
  });

  describe("legacy conflicts", () => {
    test("throws when destination scope has only a legacy item", async () => {
      const catalog = makeCatalog();
      const legacyDir = join(TEST_DIR, "legacy-user", "templates");
      await mkdir(legacyDir, { recursive: true });
      await writeFile(join(legacyDir, "test-template.atomize.yaml"), VALID_TEMPLATE, "utf-8");

      await expect(
        catalog.installFromContent(VALID_TEMPLATE, "test-template.yaml", "template"),
      ).rejects.toThrow('A template named "test-template" already exists.');
    });

    test("overwrite writes new catalog item and removes same-stem legacy variants", async () => {
      const catalog = makeCatalog();
      const legacyDir = join(TEST_DIR, "legacy-user", "templates");
      await mkdir(legacyDir, { recursive: true });
      await writeFile(join(legacyDir, "test-template.atomize.yaml"), VALID_TEMPLATE, "utf-8");
      await writeFile(join(legacyDir, "test-template.yml"), VALID_TEMPLATE, "utf-8");
      await writeFile(join(legacyDir, "other-template.yaml"), VALID_TEMPLATE, "utf-8");

      const item = await catalog.installFromContent(
        VALID_TEMPLATE,
        "test-template.yaml",
        "template",
        "user",
        { overwrite: true },
      );

      expect(item.path).toContain(join("user", "templates", "test-template.atomize.yaml"));
      expect(existsSync(join(legacyDir, "test-template.atomize.yaml"))).toBe(false);
      expect(existsSync(join(legacyDir, "test-template.yml"))).toBe(false);
      expect(existsSync(join(legacyDir, "other-template.yaml"))).toBe(true);
    });
  });

  describe("directory creation", () => {
    test("creates the target directory tree if absent", async () => {
      const catalog = makeCatalog();
      expect(existsSync(join(TEST_DIR, "user"))).toBe(false);

      await catalog.installFromContent(VALID_TEMPLATE, "test-template.yaml", "template");

      expect(existsSync(join(TEST_DIR, "user"))).toBe(true);
    });
  });

  describe("metadata extraction", () => {
    test("uses name and description from content", async () => {
      const catalog = makeCatalog();
      const item = await catalog.installFromContent(VALID_TEMPLATE, "test-template.yaml", "template");

      expect(item.displayName).toBe("test-template");
      expect(item.description).toBe("A test template");
    });

    test("uses yaml name as displayName regardless of filename", async () => {
      const catalog = makeCatalog();
      const item = await catalog.installFromContent(VALID_TEMPLATE, "different-filename.yaml", "template");

      expect(item.displayName).toBe("test-template");
      expect(item.name).toBe("different-filename");
    });
  });

  describe("validation", () => {
    test("throws for non-YAML extension", async () => {
      const catalog = makeCatalog();
      await expect(
        catalog.installFromContent(VALID_TEMPLATE, "template.txt", "template"),
      ).rejects.toThrow("must use .yaml or .yml");
    });

    test("throws for invalid template name", async () => {
      const catalog = makeCatalog();
      await expect(
        catalog.installFromContent(VALID_TEMPLATE, "my template.yaml", "template"),
      ).rejects.toThrow("Invalid template name");
    });

    test("throws for content that fails schema validation", async () => {
      const catalog = makeCatalog();
      await expect(
        catalog.installFromContent(MISSING_REQUIRED_FIELDS, "bad-template.yaml", "template"),
      ).rejects.toThrow("Invalid template");
    });
  });
});
