import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TemplateLibrary } from "@sppg2001/atomize-core/templates/template-library";

describe("TemplateLibrary.composeTemplate", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "atomize-compose-"));
    await writeFile(
      join(dir, "base.yaml"),
      'version: "1.0"\nname: Base\nfilter:\n  workItemTypes: ["User Story"]\ntasks:\n  - id: design\n    title: Design\n    estimationPercent: 40\n',
    );
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  test("composes an in-memory Template as if it were saved at the given path", async () => {
    const proposal = {
      version: "1.0",
      name: "Child",
      extends: "./base.yaml",
      tasks: [{ id: "build", title: "Build", estimationPercent: 60 }],
    };

    const composed = await new TemplateLibrary().composeTemplate(proposal, join(dir, "child.yaml"));

    expect(composed.name).toBe("Child");
    expect(composed.tasks.map((task) => task.title)).toEqual(["Design", "Build"]);
    expect(composed.filter.workItemTypes).toEqual(["User Story"]);
  });

  test("returns a Template without inheritance as it is", async () => {
    const plain = { version: "1.0", name: "Plain", filter: {}, tasks: [{ title: "A", estimationPercent: 100 }] };
    expect(await new TemplateLibrary().composeTemplate(plain, join(dir, "plain.yaml"))).toEqual(plain as never);
  });
});
