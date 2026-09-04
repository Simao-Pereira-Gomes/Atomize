import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TemplateCatalog } from "@sppg2001/atomize-core/services/template/template-catalog";

const TEST_DIR = join(tmpdir(), `atomize-catalog-list-all-test-${process.pid}`);

function makeCatalog(): TemplateCatalog {
  return new TemplateCatalog({
    userRoot: join(TEST_DIR, "user"),
    projectRoot: join(TEST_DIR, "project"),
    legacyUserRoot: join(TEST_DIR, "legacy-user"),
    legacyProjectRoot: join(TEST_DIR, "legacy-project"),
    packageRoot: join(TEST_DIR, "package"),
  });
}

async function writeTemplate(dir: string, name: string, extra = ""): Promise<void> {
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, `${name}.atomize.yaml`),
    `name: ${name}\ndescription: desc\nfilter:\n  workItemTypes:\n    - User Story\ntasks:\n  - title: task${extra ? `\n${extra}` : ""}`,
    "utf-8",
  );
}

async function writeMixin(dir: string, name: string, extra = ""): Promise<void> {
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, `${name}.atomize.yaml`),
    `name: ${name}\ntasks:\n  - title: mixin-task${extra ? `\n${extra}` : ""}`,
    "utf-8",
  );
}

beforeEach(async () => {
  await rm(TEST_DIR, { recursive: true, force: true });
});

afterEach(async () => {
  await rm(TEST_DIR, { recursive: true, force: true });
});

describe("TemplateCatalog.listAllWithOverrides", () => {
  test("returns empty arrays when catalog is empty", async () => {
    const catalog = makeCatalog();
    const { items, overrides, lineage } = await catalog.listAllWithOverrides();
    expect(items).toEqual([]);
    expect(overrides).toEqual([]);
    expect(lineage).toEqual([]);
  });

  test("returns templates and mixins combined", async () => {
    const catalog = makeCatalog();
    const userTemplates = join(TEST_DIR, "user", "templates");
    const userMixins = join(TEST_DIR, "user", "mixins");

    await writeTemplate(userTemplates, "alpha");
    await writeMixin(userMixins, "shared");

    const { items } = await catalog.listAllWithOverrides();
    const refs = items.map((i) => i.ref);
    expect(refs).toContain("template:alpha");
    expect(refs).toContain("mixin:shared");
  });

  test("reads legacy roots but keeps new root active within the same scope", async () => {
    const catalog = new TemplateCatalog({
      userRoot: join(TEST_DIR, "user", "catalog"),
      legacyUserRoot: join(TEST_DIR, "user", "templates"),
      projectRoot: join(TEST_DIR, "project", "catalog"),
      legacyProjectRoot: join(TEST_DIR, "project", "templates"),
      packageRoot: join(TEST_DIR, "package"),
    });
    const legacyUserTemplates = join(TEST_DIR, "user", "templates", "templates");
    const userTemplates = join(TEST_DIR, "user", "catalog", "templates");

    await writeTemplate(legacyUserTemplates, "shared");
    await writeTemplate(userTemplates, "shared");

    const { items, overrides } = await catalog.listWithOverrides("template");
    const item = items.find((candidate) => candidate.name === "shared");
    expect(item?.scope).toBe("user");
    expect(item?.path).toContain(join("user", "catalog", "templates", "shared.atomize.yaml"));
    expect(overrides.at(0)?.overridden.path).toContain(join("user", "templates", "templates", "shared.atomize.yaml"));
  });

  test("combines overrides from both kinds", async () => {
    const catalog = makeCatalog();
    const builtinTemplates = join(TEST_DIR, "package", "catalog", "templates");
    const userTemplates = join(TEST_DIR, "user", "templates");
    const builtinMixins = join(TEST_DIR, "package", "catalog", "mixins");
    const userMixins = join(TEST_DIR, "user", "mixins");

    await writeTemplate(builtinTemplates, "base");
    await writeTemplate(userTemplates, "base");
    await writeMixin(builtinMixins, "core");
    await writeMixin(userMixins, "core");

    const { overrides } = await catalog.listAllWithOverrides();
    const activeRefs = overrides.map((o) => o.active.ref);
    expect(activeRefs).toContain("template:base");
    expect(activeRefs).toContain("mixin:core");
  });

  test("resolves within-kind lineage", async () => {
    const catalog = makeCatalog();
    const builtinTemplates = join(TEST_DIR, "package", "catalog", "templates");
    const userTemplates = join(TEST_DIR, "user", "templates");

    await writeTemplate(builtinTemplates, "origin-tmpl");
    await writeTemplate(userTemplates, "derived-tmpl", 'origin: "template:origin-tmpl"');

    const { lineage } = await catalog.listAllWithOverrides();
    expect(lineage).toHaveLength(1);
    const entry0 = lineage.at(0);
    expect(entry0?.item.ref).toBe("template:derived-tmpl");
    expect(entry0?.originItem.ref).toBe("template:origin-tmpl");
  });

  test("resolves cross-kind lineage (template origin from mixin)", async () => {
    const catalog = makeCatalog();
    const userTemplates = join(TEST_DIR, "user", "templates");
    const userMixins = join(TEST_DIR, "user", "mixins");

    await writeMixin(userMixins, "source-mixin");
    await writeTemplate(userTemplates, "derived-tmpl", 'origin: "mixin:source-mixin"');

    const { lineage } = await catalog.listAllWithOverrides();
    expect(lineage).toHaveLength(1);
    const entry0 = lineage.at(0);
    expect(entry0?.item.ref).toBe("template:derived-tmpl");
    expect(entry0?.originItem.ref).toBe("mixin:source-mixin");
    expect(entry0?.originItem.kind).toBe("mixin");
  });

  test("omits lineage when origin ref cannot be resolved", async () => {
    const catalog = makeCatalog();
    const userTemplates = join(TEST_DIR, "user", "templates");

    await writeTemplate(userTemplates, "derived-tmpl", 'origin: "template:nonexistent"');

    const { lineage } = await catalog.listAllWithOverrides();
    expect(lineage).toHaveLength(0);
  });
});

describe("TemplateCatalog.listWithOverrides lineage (ref-key fix)", () => {
  test("resolves within-kind lineage by full ref, not bare name", async () => {
    const catalog = makeCatalog();
    const builtinMixins = join(TEST_DIR, "package", "catalog", "mixins");
    const userMixins = join(TEST_DIR, "user", "mixins");

    await writeMixin(builtinMixins, "base-mix");
    await writeMixin(userMixins, "derived-mix", 'origin: "mixin:base-mix"');

    const { lineage } = await catalog.listWithOverrides("mixin");
    expect(lineage).toHaveLength(1);
    const entry0 = lineage.at(0);
    expect(entry0?.item.ref).toBe("mixin:derived-mix");
    expect(entry0?.originItem.ref).toBe("mixin:base-mix");
  });

  test("does not resolve cross-kind lineage (per-kind path limitation)", async () => {
    const catalog = makeCatalog();
    const userTemplates = join(TEST_DIR, "user", "templates");
    const userMixins = join(TEST_DIR, "user", "mixins");

    await writeMixin(userMixins, "source-mixin");
    await writeTemplate(userTemplates, "derived-tmpl", 'origin: "mixin:source-mixin"');

    // Per-kind path: only sees templates, cannot resolve mixin origin
    const { lineage } = await catalog.listWithOverrides("template");
    expect(lineage).toHaveLength(0);
  });
});
