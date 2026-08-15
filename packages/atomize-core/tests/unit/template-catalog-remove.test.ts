import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TemplateCatalog } from "@sppg2001/atomize-core/services/template/template-catalog";

const TEST_DIR = join(tmpdir(), `atomize-catalog-remove-test-${process.pid}`);

const VALID_TEMPLATE = `name: test-template
description: A test template
filter:
  workItemTypes:
    - User Story
tasks:
  - title: Test task`;

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

describe("TemplateCatalog.removeUserItem", () => {
  test("deletes a user-scope template and returns the removed item", async () => {
    const catalog = makeCatalog();
    const installed = await catalog.installFromContent(VALID_TEMPLATE, "test-template.yaml", "template");
    expect(existsSync(installed.path)).toBe(true);

    const removed = await catalog.removeUserItem("template", "test-template");

    expect(removed.path).toBe(installed.path);
    expect(existsSync(installed.path)).toBe(false);
  });

  test("throws a CATALOG_ITEM_NOT_FOUND error for a name with no catalog item", async () => {
    const catalog = makeCatalog();
    await expect(catalog.removeUserItem("template", "does-not-exist")).rejects.toMatchObject({
      code: "CATALOG_ITEM_NOT_FOUND",
      message: 'Template "does-not-exist" not found.',
    });
  });

  test("refuses to delete a project-scope item and leaves it on disk", async () => {
    const catalog = makeCatalog();
    const installed = await catalog.installFromContent(VALID_TEMPLATE, "test-template.yaml", "template", "project");

    await expect(catalog.removeUserItem("template", "test-template")).rejects.toMatchObject({
      code: "CATALOG_ITEM_NOT_USER_SCOPED",
      message: 'Cannot remove "test-template" — it is a project template and is not user-installed.',
    });
    expect(existsSync(installed.path)).toBe(true);
  });
});
