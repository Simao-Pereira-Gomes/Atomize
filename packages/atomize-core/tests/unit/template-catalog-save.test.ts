import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TemplateCatalog } from "@sppg2001/atomize-core/services/template/template-catalog";
import { TemplateSourceResolver } from "@sppg2001/atomize-core/templates/source-resolver";
import { TemplateLibrary } from "@sppg2001/atomize-core/templates/template-library";

const TEST_DIR = join(tmpdir(), `atomize-catalog-save-test-${process.pid}`);
const template = { version: "1.0", name: "Delivery", filter: { workItemTypes: ["User Story"] }, tasks: [{ title: "Plan", estimationPercent: 100 }] };

const library = () => {
  const catalog = new TemplateCatalog({
    packageRoot: join(TEST_DIR, "package"),
    userRoot: join(TEST_DIR, "user", "catalog"),
    legacyUserRoot: join(TEST_DIR, "user", "templates"),
    projectRoot: join(TEST_DIR, "project", ".atomize", "catalog"),
    legacyProjectRoot: join(TEST_DIR, "project", ".atomize", "templates"),
  });
  return new TemplateLibrary(new TemplateSourceResolver(undefined, catalog), catalog);
};

beforeEach(async () => { await rm(TEST_DIR, { recursive: true, force: true }); });
afterEach(async () => { await rm(TEST_DIR, { recursive: true, force: true }); });

describe("saving a Template to the Catalog", () => {
  test("saves to the personal Catalog by default", async () => {
    const item = await library().saveTemplate({ kind: "template", name: "delivery", template });
    expect(item.scope).toBe("user");
    expect(item.path).toBe(join(TEST_DIR, "user", "catalog", "templates", "delivery.atomize.yaml"));
  });

  test("saves to the project Catalog when asked", async () => {
    const lib = library();
    const item = await lib.saveTemplate({ kind: "template", name: "delivery", template, scope: "project" });
    expect(item).toMatchObject({ scope: "project", ref: "template:delivery" });
    expect(item.path).toBe(lib.getTemplatePath("template", "project", "delivery"));
    expect(await readFile(item.path, "utf8")).toContain("name: Delivery");
    expect(await lib.templateExists("template", "project", "delivery")).toBe(true);
    expect(await lib.templateExists("template", "user", "delivery")).toBe(false);
  });

  test("won't replace a project item without overwrite", async () => {
    const lib = library();
    await lib.saveTemplate({ kind: "template", name: "delivery", template, scope: "project" });
    await expect(lib.saveTemplate({ kind: "template", name: "delivery", template, scope: "project" })).rejects.toThrow("already exists");
  });
});

describe("a folder with no project", () => {
  const home = () => join(TEST_DIR, "home");
  const template = { version: "1.0", name: "Delivery", filter: { workItemTypes: ["User Story"] }, tasks: [{ title: "Plan", estimationPercent: 100 }] };

  test("the home folder is not a project, so it has no project Catalog", async () => {
    const catalog = new TemplateCatalog({ packageRoot: join(TEST_DIR, "package"), invocationCwd: home(), homeDirectory: home() });
    expect(catalog.hasProject).toBe(false);
    expect(() => catalog.getProjectTemplatePath("template", "delivery")).toThrow("isn't in a project");
  });

  test("a personal item isn't listed a second time as a project item", async () => {
    const catalog = new TemplateCatalog({ packageRoot: join(TEST_DIR, "package"), invocationCwd: home(), homeDirectory: home() });
    await catalog.saveUserTemplate({ kind: "template", name: "delivery", template });
    const items = await catalog.listTemplates();
    expect(items.filter((item) => item.name === "delivery").map((item) => item.scope)).toEqual(["user"]);
  });

  test("a project under the home folder still has its own project Catalog", async () => {
    const project = join(home(), "dev", "project");
    await mkdir(join(project, ".atomize"), { recursive: true });
    const catalog = new TemplateCatalog({ packageRoot: join(TEST_DIR, "package"), invocationCwd: project, homeDirectory: home() });
    expect(catalog.hasProject).toBe(true);
    expect(catalog.getProjectTemplatePath("template", "delivery")).toBe(join(project, ".atomize", "catalog", "templates", "delivery.atomize.yaml"));
  });
});

describe("installing an Atomize YAML File", () => {
  test("names a .atomize.yaml file without its extension", async () => {
    const source = join(TEST_DIR, "source", "backend-api.atomize.yaml");
    await mkdir(join(TEST_DIR, "source"), { recursive: true });
    await Bun.write(source, "version: \"1.0\"\nname: Backend API\nfilter: {}\ntasks:\n  - title: Build\n    estimationPercent: 100\n");
    const preview = await library().previewInstall({ source, scope: "project" });
    expect(preview.source.name).toBe("backend-api");
    expect(preview.targetPath).toBe(join(TEST_DIR, "project", ".atomize", "catalog", "templates", "backend-api.atomize.yaml"));
  });
});
