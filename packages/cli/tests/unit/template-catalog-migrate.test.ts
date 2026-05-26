import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TemplateCatalog } from "@services/template/template-catalog";

const TEST_DIR = join(tmpdir(), `atomize-catalog-migrate-test-${process.pid}`);

const MINIMAL_YAML = `name: test\ntasks:\n  - title: Task`;

function makeCatalog(): TemplateCatalog {
  return new TemplateCatalog({
    userRoot: join(TEST_DIR, "user"),
    projectRoot: join(TEST_DIR, "project"),
    legacyUserRoot: join(TEST_DIR, "legacy-user"),
    legacyProjectRoot: join(TEST_DIR, "legacy-project"),
    packageRoot: join(TEST_DIR, "package"),
  });
}

async function writeLegacyFile(
  kind: "template" | "mixin",
  name: string,
  scope: "user" | "project" = "user",
  ext = ".atomize.yaml",
  content = MINIMAL_YAML,
): Promise<string> {
  const folder = kind === "template" ? "templates" : "mixins";
  const legacyBase = scope === "user" ? "legacy-user" : "legacy-project";
  const dir = join(TEST_DIR, legacyBase, folder);
  await mkdir(dir, { recursive: true });
  const path = join(dir, `${name}${ext}`);
  await writeFile(path, content, "utf-8");
  return path;
}

beforeEach(async () => {
  await rm(TEST_DIR, { recursive: true, force: true });
});

afterEach(async () => {
  await rm(TEST_DIR, { recursive: true, force: true });
});

describe("TemplateCatalog.migrateLegacyItems", () => {
  test("migrates a user-scoped template from legacy path to new catalog path", async () => {
    const catalog = makeCatalog();
    const sourcePath = await writeLegacyFile("template", "foo");

    const result = await catalog.migrateLegacyItems("user", {});

    expect(result.migrated).toHaveLength(1);
    expect(result.migrated[0]?.kind).toBe("template");
    expect(result.migrated[0]?.name).toBe("foo");
    expect(result.migrated[0]?.sourcePath).toBe(sourcePath);
    expect(result.migrated[0]?.destPath).toContain(join("user", "templates", "foo.atomize.yaml"));
    expect(existsSync(result.migrated[0]?.destPath ?? "")).toBe(true);
    expect(result.skipped).toHaveLength(0);
    expect(result.dirsCleaned).toHaveLength(0);
  });

  test("skips a template that already exists in the new catalog path", async () => {
    const catalog = makeCatalog();
    await writeLegacyFile("template", "foo");
    const newDir = join(TEST_DIR, "user", "templates");
    await mkdir(newDir, { recursive: true });
    const existingPath = join(newDir, "foo.atomize.yaml");
    await writeFile(existingPath, MINIMAL_YAML, "utf-8");

    const result = await catalog.migrateLegacyItems("user", {});

    expect(result.migrated).toHaveLength(0);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0]?.kind).toBe("template");
    expect(result.skipped[0]?.name).toBe("foo");
    expect(result.skipped[0]?.existingPath).toBe(existingPath);
  });

  test("removes all same-stem extension variants from legacy dir after migration", async () => {
    const catalog = makeCatalog();
    const legacyDir = join(TEST_DIR, "legacy-user", "templates");
    await writeLegacyFile("template", "foo", "user", ".atomize.yaml");
    await writeLegacyFile("template", "foo", "user", ".atomize.yml");
    await writeLegacyFile("template", "foo", "user", ".yaml");
    await writeLegacyFile("template", "foo", "user", ".yml");

    await catalog.migrateLegacyItems("user", {});

    expect(existsSync(join(legacyDir, "foo.atomize.yaml"))).toBe(false);
    expect(existsSync(join(legacyDir, "foo.atomize.yml"))).toBe(false);
    expect(existsSync(join(legacyDir, "foo.yaml"))).toBe(false);
    expect(existsSync(join(legacyDir, "foo.yml"))).toBe(false);
  });

  test("migrates a project-scoped template using legacyProjectRoot", async () => {
    const catalog = makeCatalog();
    await writeLegacyFile("template", "bar", "project");

    const result = await catalog.migrateLegacyItems("project", {});

    expect(result.migrated).toHaveLength(1);
    expect(result.migrated[0]?.destPath).toContain(join("project", "templates", "bar.atomize.yaml"));
    expect(existsSync(result.migrated[0]?.destPath ?? "")).toBe(true);
  });

  test("migrates both templates and mixins for the given scope", async () => {
    const catalog = makeCatalog();
    await writeLegacyFile("template", "my-template");
    await writeLegacyFile("mixin", "my-mixin");

    const result = await catalog.migrateLegacyItems("user", {});

    const templateEntry = result.migrated.find((m) => m.kind === "template");
    const mixinEntry = result.migrated.find((m) => m.kind === "mixin");
    expect(templateEntry?.name).toBe("my-template");
    expect(mixinEntry?.name).toBe("my-mixin");
    expect(result.migrated).toHaveLength(2);
  });

  test("dry run does not write or delete files but returns the same migrated data", async () => {
    const catalog = makeCatalog();
    const sourcePath = await writeLegacyFile("template", "foo");

    const result = await catalog.migrateLegacyItems("user", { dryRun: true });

    expect(result.migrated).toHaveLength(1);
    expect(result.migrated[0]?.name).toBe("foo");
    expect(existsSync(sourcePath)).toBe(true);
    expect(existsSync(result.migrated[0]?.destPath ?? "")).toBe(false);
  });

  test("cleanupDirs removes an empty legacy kind subdir after migration", async () => {
    const catalog = makeCatalog();
    const legacyDir = join(TEST_DIR, "legacy-user", "templates");
    await writeLegacyFile("template", "foo");

    const result = await catalog.migrateLegacyItems("user", { cleanupDirs: true });

    expect(existsSync(legacyDir)).toBe(false);
    expect(result.dirsCleaned).toContain(legacyDir);
    expect(existsSync(join(TEST_DIR, "user", "templates", "foo.atomize.yaml"))).toBe(true);
  });

  test("cleanupDirs removes the legacy root when all kind subdirs are removed", async () => {
    const catalog = makeCatalog();
    const legacyRoot = join(TEST_DIR, "legacy-user");
    await writeLegacyFile("template", "foo");
    await writeLegacyFile("mixin", "bar");

    const result = await catalog.migrateLegacyItems("user", { cleanupDirs: true });

    expect(existsSync(legacyRoot)).toBe(false);
    expect(result.dirsCleaned).toContain(join(legacyRoot, "templates"));
    expect(result.dirsCleaned).toContain(join(legacyRoot, "mixins"));
    expect(result.dirsCleaned).toContain(legacyRoot);
  });

  test("cleanupDirs with dry run reports dirs that would be removed without touching filesystem", async () => {
    const catalog = makeCatalog();
    const legacyDir = join(TEST_DIR, "legacy-user", "templates");
    await writeLegacyFile("template", "foo");

    const result = await catalog.migrateLegacyItems("user", { dryRun: true, cleanupDirs: true });

    expect(result.dirsCleaned).toContain(legacyDir);
    expect(existsSync(legacyDir)).toBe(true);
    const files = await readdir(legacyDir);
    expect(files).toContain("foo.atomize.yaml");
  });

  test("cleanupDirs does not remove a kind subdir that contains unrelated files", async () => {
    const catalog = makeCatalog();
    const legacyDir = join(TEST_DIR, "legacy-user", "templates");
    await writeLegacyFile("template", "foo");
    await writeFile(join(legacyDir, "README.md"), "# notes", "utf-8");

    const result = await catalog.migrateLegacyItems("user", { cleanupDirs: true });

    expect(existsSync(legacyDir)).toBe(true);
    expect(result.dirsCleaned).not.toContain(legacyDir);
  });
});
