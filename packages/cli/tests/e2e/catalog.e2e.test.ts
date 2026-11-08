import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { E2EWorkspace } from "./harness";

/** Covers the Template Library and Catalog changes (#310, #311, #312) and YAML preservation on install (#325, #326). */
type ListItem = { ref: string; scope: string; kind: string; path: string; template?: { tasks: Array<{ id?: string; title: string }> } };

const PROJECT_CHILD_TASKS = ["design", "implement", "verify", "security-review", "dependency-audit", "team-review", "deploy", "proj-docs"];

let ws: E2EWorkspace;
beforeEach(async () => { ws = await E2EWorkspace.create(); });
afterEach(async () => { await ws.dispose(); });

describe("template list", () => {
  test("--json lists every scope and resolves composed Templates across user, project and built-in Catalogs", async () => {
    const { json, exitCode } = await ws.runJson<ListItem[]>(["template", "list", "--json"]);

    expect(exitCode).toBe(0);
    const byRef = new Map(json.map((item) => [item.ref, item]));
    expect(byRef.get("template:user-child")?.scope).toBe("user");
    expect(byRef.get("template:proj-child")?.scope).toBe("project");
    expect(byRef.get("mixin:team-review")?.scope).toBe("user");
    expect(byRef.get("mixin:proj-docs")?.scope).toBe("project");
    expect(byRef.get("template:backend-api")?.scope).toBe("builtin");

    const projectChild = byRef.get("template:proj-child")?.template;
    expect(projectChild?.tasks.map((task) => task.id)).toEqual(PROJECT_CHILD_TASKS);
    // biome-ignore lint/suspicious/noTemplateCurlyInString: a Template interpolation placeholder, not a JS template
    expect(projectChild?.tasks[0]?.title).toBe("Project design for ${story.title}");
    expect(byRef.get("mixin:proj-docs")?.template).toBeUndefined();
  });

  test("--json from the home folder lists no project items, whatever path the home folder is reached by", async () => {
    const { json, exitCode } = await ws.runJson<ListItem[]>(["template", "list", "--json"], { cwd: ws.home });

    expect(exitCode).toBe(0);
    expect(json.filter((item) => item.scope === "project").map((item) => item.ref)).toEqual([]);
    expect(json.find((item) => item.ref === "template:user-child")?.scope).toBe("user");
  });

  test("--type mixin lists only Mixins", async () => {
    const { json } = await ws.runJson<ListItem[]>(["template", "list", "--json", "--type", "mixin"]);
    expect(json.length).toBeGreaterThan(0);
    expect(json.every((item) => item.kind === "mixin")).toBe(true);
  });

  test("the human-readable list shows the user and project items", async () => {
    const { stdout, exitCode } = await ws.run(["template", "list"]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("template:user-child");
    expect(stdout).toContain("template:proj-child");
  });
});

describe("template resolve", () => {
  test("composes a project Template that extends a user Template that extends a built-in one", async () => {
    const { stdout, exitCode } = await ws.run(["template", "resolve", "template:proj-child", "--quiet"]);

    expect(exitCode).toBe(0);
    const ids = [...stdout.matchAll(/^\s+- id: (\S+)$/gm)].map((match) => match[1]);
    expect(ids).toEqual(PROJECT_CHILD_TASKS);
    expect(stdout).not.toContain("extends:");
  });

  test("reports a Catalog ref that doesn't exist", async () => {
    const { stderr, exitCode } = await ws.run(["template", "resolve", "template:missing", "--quiet"]);
    expect(exitCode).toBe(1);
    expect(stderr).toContain('"template:missing" not found');
  });
});

describe("template install and remove", () => {
  test("installs into the personal Catalog byte for byte, keeping YAML anchors and comments", async () => {
    const source = ws.file("anchors.atomize.yaml");
    const { exitCode } = await ws.run(["template", "install", source, "--scope", "user", "-q"]);

    expect(exitCode).toBe(0);
    const installed = await ws.read(join(ws.home, ".atomize/catalog/templates/anchors.atomize.yaml"));
    expect(installed).toBe(await ws.read(source));
    expect(installed).toContain("&api");
    expect(installed).toContain("*api");
    expect(installed).toContain("# keep this comment");
  });

  test("installs into the project Catalog, which list then reports as project scope", async () => {
    const { exitCode } = await ws.run(["template", "install", ws.file("tshirt.atomize.yaml"), "--scope", "project", "-q"]);

    expect(exitCode).toBe(0);
    expect(existsSync(join(ws.project, ".atomize/catalog/templates/tshirt.atomize.yaml"))).toBe(true);
    const { json } = await ws.runJson<ListItem[]>(["template", "list", "--json"]);
    expect(json.find((item) => item.ref === "template:tshirt")?.scope).toBe("project");
  });

  test("refuses to overwrite an existing item without --overwrite", async () => {
    await ws.run(["template", "install", ws.file("anchors.atomize.yaml"), "--scope", "user", "-q"]);
    const second = await ws.run(["template", "install", ws.file("anchors.atomize.yaml"), "--scope", "user", "-q"]);
    expect(second.exitCode).not.toBe(0);
  });

  test("removes a personal item, and refuses a project item (ADR-0049)", async () => {
    await ws.run(["template", "install", ws.file("anchors.atomize.yaml"), "--scope", "user", "-q"]);
    await ws.run(["template", "install", ws.file("tshirt.atomize.yaml"), "--scope", "project", "-q"]);

    const removed = await ws.run(["template", "remove", "template:anchors", "-f"]);
    expect(removed.exitCode).toBe(0);
    expect(existsSync(join(ws.home, ".atomize/catalog/templates/anchors.atomize.yaml"))).toBe(false);

    const refused = await ws.run(["template", "remove", "template:tshirt", "-f"]);
    expect(refused.exitCode).toBe(1);
    expect(refused.stdout).toContain("is not user-installed");
    expect(existsSync(join(ws.project, ".atomize/catalog/templates/tshirt.atomize.yaml"))).toBe(true);
  });
});

describe("template migrate", () => {
  const legacy = () => join(ws.home, ".atomize/templates/templates/legacy-one.yaml");
  const migrated = () => join(ws.home, ".atomize/catalog/templates/legacy-one.atomize.yaml");

  test("--dry-run reports the legacy item and changes nothing", async () => {
    const { stdout, exitCode } = await ws.run(["template", "migrate", "--dry-run", "--scope", "all"]);

    expect(exitCode).toBe(0);
    expect(stdout).toContain("would migrate  template:legacy-one");
    expect(stdout).toContain("Would migrate: 1");
    expect(existsSync(legacy())).toBe(true);
    expect(existsSync(migrated())).toBe(false);
  });

  test("moves the legacy item into the current Catalog", async () => {
    const { exitCode } = await ws.run(["template", "migrate"]);

    expect(exitCode).toBe(0);
    expect(existsSync(migrated())).toBe(true);
    expect(existsSync(legacy())).toBe(false);
  });
});
