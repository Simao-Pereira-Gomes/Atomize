import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TemplateCatalog } from "@sppg2001/atomize-core/services/template/template-catalog";
import { TemplateLibrary } from "@sppg2001/atomize-core/templates/template-library";

const TEST_DIR = join(tmpdir(), `atomize-library-install-content-test-${process.pid}`);

const VALID_TEMPLATE = `name: Delivery
description: A delivery template
filter:
  workItemTypes:
    - User Story
tasks:
  - title: Test task`;

function makeLibrary(): TemplateLibrary {
  const catalog = new TemplateCatalog({
    userRoot: join(TEST_DIR, "user"),
    projectRoot: join(TEST_DIR, "project"),
    legacyUserRoot: join(TEST_DIR, "legacy-user"),
    legacyProjectRoot: join(TEST_DIR, "legacy-project"),
    packageRoot: join(TEST_DIR, "package"),
  });
  return new TemplateLibrary(undefined, catalog);
}

beforeEach(async () => {
  await rm(TEST_DIR, { recursive: true, force: true });
});

afterEach(async () => {
  await rm(TEST_DIR, { recursive: true, force: true });
});

describe("TemplateLibrary install with in-memory content (Studio's Install to Catalog — ADR-0052)", () => {
  test("previewInstall detects kind and existence for a content source", async () => {
    const library = makeLibrary();
    const preview = await library.previewInstall({ source: { content: VALID_TEMPLATE, name: "delivery" } });

    expect(preview.source.kind).toBe("template");
    expect(preview.source.name).toBe("delivery");
    expect(preview.exists).toBe(false);
  });

  test("installTemplate writes the content to the user Catalog by default", async () => {
    const library = makeLibrary();
    const item = await library.installTemplate({ source: { content: VALID_TEMPLATE, name: "delivery" } });

    expect(item.kind).toBe("template");
    expect(item.scope).toBe("user");
    expect(item.name).toBe("delivery");
    expect(item.ref).toBe("template:delivery");
  });

  test("installTemplate honors an explicit project scope", async () => {
    const library = makeLibrary();
    const item = await library.installTemplate({ source: { content: VALID_TEMPLATE, name: "delivery" }, scope: "project" });

    expect(item.scope).toBe("project");
  });

  test("installTemplate throws a CATALOG_ITEM_ALREADY_EXISTS-coded error on collision", async () => {
    const library = makeLibrary();
    await library.installTemplate({ source: { content: VALID_TEMPLATE, name: "delivery" } });

    await expect(library.installTemplate({ source: { content: VALID_TEMPLATE, name: "delivery" } }))
      .rejects.toMatchObject({ code: "CATALOG_ITEM_ALREADY_EXISTS" });
  });

  test("installTemplate overwrites when overwrite is true", async () => {
    const library = makeLibrary();
    await library.installTemplate({ source: { content: VALID_TEMPLATE, name: "delivery" } });

    const item = await library.installTemplate({
      source: { content: VALID_TEMPLATE.replace("Delivery", "Delivery v2"), name: "delivery" },
      overwrite: true,
    });

    expect(item.displayName).toBe("Delivery v2");
  });
});
