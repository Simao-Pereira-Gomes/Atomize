import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TemplateCatalog } from "@sppg2001/atomize-core/services/template/template-catalog";
import { defaultCatalogScope, discoverWorkspaceRoot } from "@sppg2001/atomize-core/services/template/workspace-root";

const TEST_DIR = join(tmpdir(), `atomize-workspace-root-test-${process.pid}`);

const VALID_TEMPLATE = `name: team
description: Team template
filter:
  workItemTypes:
    - User Story
tasks:
  - title: Team task`;

beforeEach(async () => {
  await rm(TEST_DIR, { recursive: true, force: true });
});

afterEach(async () => {
  await rm(TEST_DIR, { recursive: true, force: true });
});

describe("discoverWorkspaceRoot", () => {
  test("prefers nearest .atomize directory over git root", async () => {
    const repo = join(TEST_DIR, "repo");
    const nested = join(repo, "packages", "app");
    await mkdir(join(repo, ".git"), { recursive: true });
    await mkdir(join(nested, ".atomize"), { recursive: true });

    expect(discoverWorkspaceRoot(join(nested, "src"))).toBe(nested);
  });

  test("ignores .atomize files", async () => {
    const repo = join(TEST_DIR, "repo");
    const nested = join(repo, "src");
    await mkdir(nested, { recursive: true });
    await writeFile(join(nested, ".atomize"), "", "utf-8");
    await writeFile(join(repo, ".git"), "gitdir: ../real-git", "utf-8");

    expect(discoverWorkspaceRoot(nested)).toBe(repo);
  });

  test("never treats the home folder's .atomize as a project marker", async () => {
    // ~/.atomize holds Connection Profiles and the user Catalog, so it exists for nearly every user.
    const home = join(TEST_DIR, "home");
    const repo = join(home, "dev", "repo");
    await mkdir(join(home, ".atomize"), { recursive: true });
    await mkdir(join(repo, ".git"), { recursive: true });
    await mkdir(join(repo, "packages", "app"), { recursive: true });

    expect(discoverWorkspaceRoot(join(repo, "packages", "app"), home)).toBe(repo);
  });

  test("still uses a .atomize folder below the home folder", async () => {
    const home = join(TEST_DIR, "home");
    const project = join(home, "dev", "project");
    await mkdir(join(home, ".atomize"), { recursive: true });
    await mkdir(join(project, ".atomize"), { recursive: true });
    await mkdir(join(project, "src"), { recursive: true });

    expect(discoverWorkspaceRoot(join(project, "src"), home)).toBe(project);
  });

  test("never treats a folder inside the home .atomize as a project", async () => {
    // ~/.atomize/catalog/templates holds the personal Catalog: a file there belongs to no project.
    const home = join(TEST_DIR, "home");
    const personalTemplates = join(home, ".atomize", "catalog", "templates");
    await mkdir(personalTemplates, { recursive: true });

    expect(discoverWorkspaceRoot(personalTemplates, home)).toBe(home);
    expect(defaultCatalogScope(personalTemplates, home)).toBe("user");
  });

  test("falls back to the invocation cwd, not the home folder, outside any repo", async () => {
    const home = join(TEST_DIR, "home");
    const loose = join(home, "notes");
    await mkdir(join(home, ".atomize"), { recursive: true });
    await mkdir(loose, { recursive: true });

    expect(discoverWorkspaceRoot(loose, home)).toBe(loose);
  });

  test("falls back to invocation cwd", async () => {
    const cwd = join(TEST_DIR, "loose", "nested");
    await mkdir(cwd, { recursive: true });

    expect(discoverWorkspaceRoot(cwd)).toBe(cwd);
  });
});

describe("defaultCatalogScope", () => {
  test("is project when the project has its own .atomize folder", async () => {
    const home = join(TEST_DIR, "home");
    const repo = join(home, "dev", "repo");
    await mkdir(join(home, ".atomize"), { recursive: true });
    await mkdir(join(repo, ".git"), { recursive: true });
    await mkdir(join(repo, ".atomize"), { recursive: true });
    await mkdir(join(repo, "src"), { recursive: true });

    expect(defaultCatalogScope(join(repo, "src"), home)).toBe("project");
  });

  test("is user in a repo that hasn't opted in with a .atomize folder", async () => {
    const home = join(TEST_DIR, "home");
    const repo = join(home, "dev", "repo");
    await mkdir(join(home, ".atomize"), { recursive: true });
    await mkdir(join(repo, ".git"), { recursive: true });

    expect(defaultCatalogScope(repo, home)).toBe("user");
  });

  test("is user from the home folder, whose .atomize holds Atomize's own settings", async () => {
    const home = join(TEST_DIR, "home");
    await mkdir(join(home, ".atomize"), { recursive: true });

    expect(defaultCatalogScope(home, home)).toBe("user");
  });
});

describe("TemplateCatalog project root discovery", () => {
  test("anchors project legacy reads to discovered git workspace root", async () => {
    const repo = join(TEST_DIR, "repo");
    const nested = join(repo, "src", "feature");
    await mkdir(join(repo, ".git"), { recursive: true });
    await mkdir(nested, { recursive: true });
    await mkdir(join(repo, ".atomize", "templates", "templates"), { recursive: true });
    await writeFile(
      join(repo, ".atomize", "templates", "templates", "team.atomize.yaml"),
      VALID_TEMPLATE,
      "utf-8",
    );

    const catalog = new TemplateCatalog({
      invocationCwd: nested,
      packageRoot: join(TEST_DIR, "package"),
      userRoot: join(TEST_DIR, "user", "catalog"),
      legacyUserRoot: join(TEST_DIR, "user", "templates"),
    });

    const items = await catalog.listTemplates();
    expect(items.map((item) => item.name)).toContain("team");
  });
});
