import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TemplateLibrary } from "@sppg2001/atomize-core/templates/template-library";

const BASE = 'version: "1.0"\nname: Base\nfilter:\n  workItemTypes: ["User Story"]\ntasks:\n  - id: design\n    title: Design\n    estimationPercent: 40\n';
const MIXIN = 'version: "1.0"\nname: Review\ntasks:\n  - id: review\n    title: Review\n    estimationPercent: 20\n';
const CHILD = 'version: "1.0"\nname: Child\nextends: template:base\nmixins: ["mixin:review"]\ntasks:\n  - id: build\n    title: Build\n    estimationPercent: 40\n';

describe("a Template Library built from one Catalog config", () => {
  let dir: string;
  let library: TemplateLibrary;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "atomize-library-root-"));
    const packageRoot = join(dir, "package");
    const project = join(dir, "project");
    await mkdir(join(packageRoot, "catalog", "templates"), { recursive: true });
    await mkdir(join(project, ".atomize", "catalog", "templates"), { recursive: true });
    await mkdir(join(project, ".atomize", "catalog", "mixins"), { recursive: true });
    await writeFile(join(project, ".atomize", "catalog", "templates", "base.atomize.yaml"), BASE);
    await writeFile(join(project, ".atomize", "catalog", "mixins", "review.atomize.yaml"), MIXIN);
    await writeFile(join(project, ".atomize", "catalog", "templates", "child.atomize.yaml"), CHILD);
    library = new TemplateLibrary({ packageRoot, invocationCwd: project, homeDirectory: join(dir, "home") });
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  test("lists project Catalog items and resolves their catalog refs from the same Catalog", async () => {
    const { items } = await library.getCatalog("template");
    expect(items.map((item) => item.ref)).toContain("template:child");

    const { template } = await library.loadSource("template:child");
    expect(template.tasks.map((task) => task.id)).toEqual(["design", "review", "build"]);
  });

  test("composes an in-memory Template's catalog refs from the same Catalog", async () => {
    const composed = await library.composeTemplate(
      { version: "1.0", name: "Draft", extends: "template:base", tasks: [{ id: "ship", title: "Ship", estimationPercent: 60 }] },
      join(dir, "project", "draft.atomize.yaml"),
    );
    expect(composed.tasks.map((task) => task.id)).toEqual(["design", "ship"]);
  });
});
